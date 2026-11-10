import { eq, sql } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { posts } from "@/db/schema";
import {
  COUNT_CAP,
  SEARCH_STATEMENT_TIMEOUT,
  WILDCARD_MAX_IDS,
} from "@/lib/config";
import { normalizeTag, resolveTagName } from "@/lib/tags";
import { parseQuery, QueryError, type SortField, type TagTerm } from "@/lib/query-parser";

export { QueryError };

export interface SearchParams {
  query: string;
  cursor?: string; // "field:dir:key_id" keyset marker (plan §8.1)
  limit: number;
}

export interface SearchResult {
  rows: (typeof posts.$inferSelect)[];
  hasMore: boolean;
  nextCursor: string | null;
  unresolved: string[];
  count: number | null; // null ⇒ timed out; see countCapped
  countCapped: boolean;
  error?: string; // bad query (QueryError) — rows empty, safe to render
}

const SORT_COL: Record<SortField, ReturnType<typeof sql>> = {
  id: sql`p.id`,
  score: sql`p.score`,
  rating: sql`p.rating`,
  width: sql`p.width`,
  height: sql`p.height`,
  created: sql`p.created_at`,
  updated: sql`p.updated_at`,
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function resolveTerm(term: TagTerm): Promise<{ ids: number[]; unresolved?: string }> {
  if (term.kind === "plain") {
    const tag = await resolveTagName(term.value);
    return tag ? { ids: [tag.id] } : { ids: [], unresolved: term.value };
  }
  if (term.kind === "wildcard") {
    const pattern = term.value.split("*").map(escapeLike).join("%");
    const rows = await db
      .select({ id: sql<number>`id`, cnt: sql<number>`post_count` })
      .from(sql`tags where name like ${pattern} order by post_count desc limit ${WILDCARD_MAX_IDS + 1}`);
    if (rows.length > WILDCARD_MAX_IDS) {
      throw new QueryError(`wildcard "${term.value}" matches 2000+ tags — narrow your search`);
    }
    return { ids: rows.map((r) => Number(r.id)) };
  }
  // fuzzy via pg_trgm (plan §7.1: night~)
  const rows = await db
    .select({ id: sql<number>`id` })
    .from(
      sql`tags where similarity(name, ${term.value}) > 0.4
          order by similarity(name, ${term.value}) desc limit ${WILDCARD_MAX_IDS + 1}`,
    );
  if (rows.length > WILDCARD_MAX_IDS) {
    throw new QueryError(`fuzzy "${term.value}" matches 2000+ tags — narrow your search`);
  }
  return { ids: rows.map((r) => Number(r.id)) };
}

function numericSql(n: { field: string; op: string; value: number }) {
  const col =
    n.field === "score" ? sql`p.score`
    : n.field === "width" ? sql`p.width`
    : n.field === "height" ? sql`p.height`
    : sql`p.id`;
  return sql`${col} ${sql.raw(n.op)} ${n.value}`;
}

/**
 * Tag search is SQL (plan §7.2): AND terms → EXISTS on post_tags,
 * NOT → NOT EXISTS, OR groups → OR of EXISTS, rarest driving the join.
 * Keyset pagination (plan §8.1), never OFFSET.
 */
export async function searchPosts(params: SearchParams): Promise<SearchResult> {
  try {
    return await runSearch(params);
  } catch (err) {
    if (err instanceof QueryError) {
      return { rows: [], hasMore: false, nextCursor: null, unresolved: [], count: 0, countCapped: false, error: err.message };
    }
    throw err;
  }
}

/** Raw pg rows arrive snake_case with bigint-as-string; normalize to the drizzle shape. */
type PostRow = (typeof posts)["$inferSelect"];
function normalizeRow(r: Record<string, unknown>): PostRow {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    sha256: String(r.sha256),
    mime: String(r.mime),
    bytes: Number(r.bytes),
    width: num(r.width),
    height: num(r.height),
    durationMs: num(r.duration_ms),
    phash: (r.phash as string | null) ?? null,
    rating: Number(r.rating),
    score: Number(r.score),
    favCount: Number(r.fav_count),
    sourceUrl: (r.source_url as string | null) ?? null,
    uploaderId: (r.uploader_id as string | null) ?? null,
    status: r.status as PostRow["status"],
    parentId: num(r.parent_id),
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

async function runSearch({ query, cursor, limit }: SearchParams): Promise<SearchResult> {
  await dbReady();
  const q = parseQuery(query);
  const unresolved: string[] = [];

  const andGroups: number[][] = [];
  let impossible = false; // an AND term with no matching tag ⇒ no results (booru semantics)
  for (const t of q.andTerms) {
    const r = await resolveTerm(t);
    if (r.unresolved) unresolved.push(r.unresolved);
    if (!r.ids.length) impossible = true;
    else andGroups.push(r.ids);
  }
  for (const g of q.orGroups) {
    // all-empty OR groups contribute nothing; a lone unresolved term inside an OR is just ignored
  }
  const notIds: number[] = [];
  for (const t of q.notTerms) {
    const r = await resolveTerm(t);
    if (r.unresolved) unresolved.push(r.unresolved);
    notIds.push(...r.ids);
  }
  const orGroups: number[][] = [];
  for (const g of q.orGroups) {
    const ids: number[] = [];
    for (const t of g) {
      const r = await resolveTerm(t);
      if (r.unresolved) unresolved.push(r.unresolved);
      ids.push(...r.ids);
    }
    if (ids.length) orGroups.push(ids);
  }

  // Rarest AND group drives the join (plan §7.2): cheapest first.
  andGroups.sort((a, b) => a.length - b.length);

  const conditions = [sql`p.status = 'active'`];

  for (const ids of andGroups) {
    conditions.push(
      sql`exists (select 1 from post_tags pt where pt.post_id = p.id and pt.tag_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}))`,
    );
  }
  for (const id of notIds) {
    conditions.push(
      sql`not exists (select 1 from post_tags pt where pt.post_id = p.id and pt.tag_id = ${id})`,
    );
  }
  for (const ids of orGroups) {
    const parts = ids.map(
      (id) => sql`exists (select 1 from post_tags pt where pt.post_id = p.id and pt.tag_id = ${id})`,
    );
    conditions.push(sql`(${sql.join(parts, sql` or `)})`);
  }

  if (q.ratings.include.length) {
    conditions.push(sql`p.rating in (${sql.join(q.ratings.include.map((r) => sql`${r}`), sql`, `)})`);
  }
  for (const r of q.ratings.exclude) {
    conditions.push(sql`p.rating <> ${r}`);
  }
  for (const n of q.numerics) conditions.push(numericSql(n));
  if (q.user) {
    conditions.push(
      sql`p.uploader_id in (select u.id from users u where lower(u.name) = ${q.user} or lower(u.email) = ${q.user})`,
    );
  }
  if (q.md5Prefix) conditions.push(sql`p.sha256 like ${escapeLike(q.md5Prefix) + "%"}`);
  if (q.parent != null) conditions.push(sql`p.parent_id = ${q.parent}`);

  const sort = q.sorts[0] ?? { field: "created" as SortField, dir: "desc" as const };
  const keyCol = SORT_COL[sort.field];
  const dirSql = sort.dir === "asc" ? sql`asc` : sql`desc`;

  if (cursor) {
    const m = /^(\w+):(\w+):(.*)_(\d+)$/.exec(cursor);
    if (!m) throw new QueryError("bad cursor");
    const [, , , keyRaw, idRaw] = m;
    const op = sort.dir === "asc" ? sql`>` : sql`<`;
    // created/updated cursors are epoch-ms; compare against timestamptz as ISO strings
    const keyParam =
      sort.field === "created" || sort.field === "updated"
        ? new Date(Number(keyRaw)).toISOString()
        : Number(keyRaw);
    conditions.push(sql`(${keyCol}, p.id) ${op} (${keyParam}, ${Number(idRaw)})`);
  }

  const where = sql.join(conditions, sql` and `);
  if (impossible) {
    return { rows: [], hasMore: false, nextCursor: null, unresolved, count: 0, countCapped: false };
  }
  const order = sql`order by ${keyCol} ${dirSql}, p.id ${dirSql}`;

  const rowsRes = (await db.execute(
    sql`select p.* from posts p where ${where} ${order} limit ${limit + 1}`,
  )) as unknown as { rows?: (typeof posts.$inferSelect)[] };
  const rowsRaw = rowsRes.rows ?? [];
  const rows = rowsRaw.map(normalizeRow);

  // Exact count capped at 10k, 2s statement timeout (plan §8.2).
  let count: number | null = 0;
  let countCapped = false;
  try {
    const c = await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = ${sql.raw(`'${SEARCH_STATEMENT_TIMEOUT}'`)}`);
      const res = (await tx.execute(
        sql`select count(*) as n from (select 1 from posts p where ${where} limit ${COUNT_CAP + 1}) t`,
      )) as unknown as { rows?: { n: string | number }[] };
      return res.rows ?? [];
    });
    const n = Number(c[0]?.n ?? 0);
    if (n > COUNT_CAP) {
      count = COUNT_CAP;
      countCapped = true;
    } else {
      count = n;
    }
  } catch {
    count = null;
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? `${sort.field}:${sort.dir}:${
          sort.field === "created"
            ? new Date(last.createdAt).getTime()
            : sort.field === "updated"
              ? new Date(last.updatedAt).getTime()
              : (last as unknown as Record<string, number>)[sort.field] ?? last.id
        }_${last.id}`
      : null;

  return { rows: page, hasMore, nextCursor, unresolved, count, countCapped };
}

export async function postById(id: number) {
  await dbReady();
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0] ?? null;
}
