import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, tags, type Rating } from "@/db/schema";
import { WILDCARD_MAX_TAGS } from "@/lib/config";
import { normalizeTag, resolveTagName } from "@/lib/tags";

export interface SearchParams {
  query: string;
  cursor?: string; // "createdAt_id" keyset marker
  limit: number;
}

export interface SearchResult {
  rows: typeof posts.$inferSelect[];
  hasMore: boolean;
  nextCursor: string | null;
  unresolved: string[]; // query tokens that matched no tag
}

const RATING_SHORTCUTS: Record<string, Rating[]> = {
  general: ["general"],
  safe: ["general", "sensitive"],
  sensitive: ["sensitive"],
  questionable: ["questionable"],
  explicit: ["explicit"],
  nsfw: ["questionable", "explicit"],
};

function tagIdsForPattern(prefix: string): number[] {
  return db
    .select({ id: tags.id })
    .from(tags)
    .where(like(tags.name, `${prefix}%`))
    .orderBy(sql`${tags.postCount} DESC`)
    .limit(WILDCARD_MAX_TAGS)
    .all()
    .map((r) => r.id);
}

interface ResolvedQuery {
  includeGroups: number[][]; // OR inside a token, AND across tokens
  excludes: number[];
  ratings: Rating[];
  unresolved: string[];
}

function resolveQuery(query: string): ResolvedQuery {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const includeGroups: number[][] = [];
  const excludes: number[] = [];
  let ratings: Rating[] = [];
  const unresolved: string[] = [];

  for (const raw of tokens) {
    const negated = raw.startsWith("-") && raw.length > 1;
    const token = negated ? raw.slice(1) : raw;

    const ratingMatch = /^rating:(.+)$/i.exec(token);
    if (ratingMatch) {
      const rs = RATING_SHORTCUTS[ratingMatch[1].toLowerCase()];
      if (rs) {
        if (negated) ratings = ratings.filter((r) => !rs.includes(r));
        else ratings.push(...rs);
        continue;
      }
    }

    const name = normalizeTag(token);
    if (!name) continue;

    let ids: number[];
    if (name.endsWith("*")) {
      ids = tagIdsForPattern(name.slice(0, -1));
    } else {
      const tag = resolveTagName(name);
      ids = tag ? [tag.id] : [];
    }
    if (!ids.length) {
      unresolved.push(name.replace(/\*$/, ""));
      continue;
    }
    if (negated) excludes.push(...ids);
    else includeGroups.push(ids);
  }
  return { includeGroups, excludes, ratings, unresolved };
}

/**
 * Keyset pagination on (created_at, id) DESC with EXISTS probes per token.
 * Fast at depth: no OFFSET, index-only on posts_status_created_idx + post_tags PK.
 */
export function searchPosts({ query, cursor, limit }: SearchParams): SearchResult {
  const { includeGroups, excludes, ratings, unresolved } = resolveQuery(query);

  const conditions = [eq(posts.status, "active")];
  if (cursor) {
    const [c, id] = cursor.split("_");
    conditions.push(
      sql`(${posts.createdAt}, ${posts.id}) < (${Number(c)}, ${Number(id)})`,
    );
  }
  if (ratings.length) {
    conditions.push(
      sql`${posts.rating} IN (${sql.join(ratings.map((r) => sql`${r}`), sql`, `)})`,
    );
  }
  for (const group of includeGroups) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM post_tags WHERE post_tags.post_id = posts.id AND post_tags.tag_id IN (${sql.join(
        group.map((id) => sql`${id}`),
        sql`, `,
      )}))`,
    );
  }
  for (const id of excludes) {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM post_tags WHERE post_tags.post_id = posts.id AND post_tags.tag_id = ${id})`,
    );
  }

  const rows = db
    .select()
    .from(posts)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${posts.createdAt} DESC, ${posts.id} DESC`)
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore && last ? `${last.createdAt}_${last.id}` : null,
    unresolved,
  };
}

export function tagByName(name: string) {
  return resolveTagName(name);
}
