import { and, eq, gte, sql } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { postTags, tagAliases, tagImplications, tags, type TagCategory } from "@/db/schema";
import { publishBackfill } from "@/lib/jobs";

/** Booru-style normalization: lowercase, spaces -> underscores, printable ASCII only. */
export function normalizeTag(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  s = s.replace(/[^\x21-\x7e]/g, "");
  s = s.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  if (!s || s.length > 100) return null;
  return s;
}

export async function findTagByName(name: string) {
  await dbReady();
  const rows = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  return rows[0] ?? null;
}

/** Alias resolution happens at READ time (plan §7.3): old spellings keep working. */
export async function resolveTagName(input: string) {
  const name = normalizeTag(input);
  if (!name) return null;
  await dbReady();
  const alias = await db
    .select({ tag: tags })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(eq(tagAliases.alias, name))
    .limit(1);
  if (alias[0]) return alias[0].tag;
  return findTagByName(name);
}

export async function getOrCreateTag(name: string, category: TagCategory = "general") {
  await dbReady();
  const existing = await findTagByName(name);
  if (existing) return existing;
  const inserted = await db
    .insert(tags)
    .values({ name, category })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await findTagByName(name);
  if (!again) throw new Error(`tag race lost for ${name}`);
  return again;
}

/** Transitive closure of implications (depth cap 8, cycle-safe) — materialised at WRITE time. */
export async function expandImplications(tagIds: number[]): Promise<number[]> {
  if (!tagIds.length) return [];
  await dbReady();
  const seen = new Set(tagIds);
  let frontier = [...tagIds];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const rows = await db
      .select({ consequent: tagImplications.consequentId })
      .from(tagImplications)
      .where(
        sql`${tagImplications.antecedentId} IN (${sql.join(
          frontier.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    frontier = rows.map((r) => r.consequent).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  return [...seen];
}

export interface ApplyTagsResult {
  applied: string[];
  created: string[];
}

/**
 * Attach (creating when unknown) tags to a post. Expands implications,
 * maintains post_count in the same transaction (plan §6).
 */
export async function applyTagsToPost(postId: number, rawTags: string[]): Promise<ApplyTagsResult> {
  await dbReady();
  const created: string[] = [];
  const ids: number[] = [];
  for (const raw of rawTags) {
    const name = normalizeTag(raw);
    if (!name) continue;
    let tag = await resolveTagName(name);
    if (!tag) {
      tag = await getOrCreateTag(name);
      created.push(name);
    }
    ids.push(tag.id);
  }
  if (!ids.length) return { applied: [], created };

  const expanded = await expandImplications(ids);
  await db.transaction(async (tx) => {
    const addedIds: number[] = [];
    for (const tagId of expanded) {
      const res = await tx
        .insert(postTags)
        .values({ postId, tagId })
        .onConflictDoNothing()
        .returning({ postId: postTags.postId });
      if (res.length) addedIds.push(tagId);
    }
    if (addedIds.length) {
      await tx
        .update(tags)
        .set({ postCount: sql`${tags.postCount} + 1` })
        .where(sql`${tags.id} IN (${sql.join(addedIds.map((id) => sql`${id}`), sql`, `)})`);
    }
  });

  const applied = await db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId));
  return { applied: applied.map((r) => r.name), created };
}

export async function replaceTagsOnPost(postId: number, rawTags: string[]): Promise<ApplyTagsResult> {
  await dbReady();
  const before = await db
    .select({ tagId: postTags.tagId })
    .from(postTags)
    .where(eq(postTags.postId, postId));
  const beforeIds = new Set(before.map((r) => r.tagId));

  const wantedNames = rawTags.map(normalizeTag).filter((n): n is string => !!n);
  const wanted: number[] = [];
  const created: string[] = [];
  for (const name of wantedNames) {
    let tag = await resolveTagName(name);
    if (!tag) {
      tag = await getOrCreateTag(name);
      created.push(name);
    }
    wanted.push(tag.id);
  }
  const expanded = await expandImplications(wanted);
  const afterIds = new Set(expanded);

  await db.transaction(async (tx) => {
    const removed = [...beforeIds].filter((id) => !afterIds.has(id));
    if (removed.length) {
      await tx.delete(postTags).where(and(eq(postTags.postId, postId), sql`${postTags.tagId} IN (${sql.join(removed.map((id) => sql`${id}`), sql`, `)})`));
      await tx
        .update(tags)
        .set({ postCount: sql`greatest(${tags.postCount} - 1, 0)` })
        .where(sql`${tags.id} IN (${sql.join(removed.map((id) => sql`${id}`), sql`, `)})`);
    }
    const added = [...afterIds].filter((id) => !beforeIds.has(id));
    if (added.length) {
      for (const tagId of added) {
        const res = await tx
          .insert(postTags)
          .values({ postId, tagId })
          .onConflictDoNothing()
          .returning({ postId: postTags.postId });
        if (res.length)
          await tx
            .update(tags)
            .set({ postCount: sql`${tags.postCount} + 1` })
            .where(eq(tags.id, tagId));
      }
    }
  });

  const applied = await db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId));
  return { applied: applied.map((r) => r.name), created };
}

export interface AutocompleteHit {
  name: string;
  postCount: number;
  category: TagCategory;
  viaAlias?: string;
}

export async function autocompleteTags(query: string, limit = 12): Promise<AutocompleteHit[]> {
  const name = normalizeTag(query);
  if (!name) return [];
  await dbReady();
  const prefix = `${name.replace(/[%*]$/g, "")}%`;

  const direct = await db
    .select()
    .from(tags)
    .where(sql`${tags.name} LIKE ${prefix}`)
    .orderBy(sql`${tags.postCount} DESC`, tags.name)
    .limit(limit);

  const viaAlias = await db
    .select({ alias: tagAliases.alias, tag: tags })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(sql`${tagAliases.alias} LIKE ${prefix}`)
    .limit(limit);

  const hits: AutocompleteHit[] = [
    ...direct.map((t) => ({ name: t.name, postCount: t.postCount, category: t.category as TagCategory })),
    ...viaAlias.map((a) => ({
      name: a.tag.name,
      postCount: a.tag.postCount,
      category: a.tag.category as TagCategory,
      viaAlias: a.alias,
    })),
  ];
  const seen = new Set<string>();
  return hits
    .filter((h) => !seen.has(h.name) && seen.add(h.name) !== undefined)
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, limit);
}

export async function tagsForPost(postId: number) {
  await dbReady();
  const rows = await db
    .select({ id: tags.id, name: tags.name, category: tags.category, postCount: tags.postCount })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId))
    .orderBy(sql`${tags.postCount} DESC`);
  return rows as { id: number; name: string; category: TagCategory; postCount: number }[];
}

export async function setAliases(tagId: number, aliases: string[]) {
  await dbReady();
  await db.transaction(async (tx) => {
    await tx.delete(tagAliases).where(eq(tagAliases.tagId, tagId));
    for (const raw of aliases) {
      const alias = normalizeTag(raw);
      if (!alias) continue;
      await tx.insert(tagAliases).values({ alias, tagId }).onConflictDoNothing();
    }
  });
}

export async function aliasesFor(tagId: number) {
  await dbReady();
  const rows = await db.select({ alias: tagAliases.alias }).from(tagAliases).where(eq(tagAliases.tagId, tagId));
  return rows.map((r) => r.alias);
}

export async function implicationsFor(tagId: number) {
  await dbReady();
  const rows = await db
    .select({ consequentId: tagImplications.consequentId, name: tags.name })
    .from(tagImplications)
    .innerJoin(tags, eq(tags.id, tagImplications.consequentId))
    .where(eq(tagImplications.antecedentId, tagId));
  return rows;
}

/**
 * Add an implication and queue the backfill (plan §7.3: one statement over
 * post_tags; done via the worker so the request never locks the table).
 */
export async function addImplication(antecedentName: string, consequentName: string) {
  await dbReady();
  const a = await getOrCreateTag(normalizeTag(antecedentName)!);
  const c = await getOrCreateTag(normalizeTag(consequentName)!);
  if (a.id === c.id) throw new Error("tag cannot imply itself");
  await db.insert(tagImplications).values({ antecedentId: a.id, consequentId: c.id }).onConflictDoNothing();
  await publishBackfill(a.id, c.id);
  return { antecedent: a, consequent: c };
}

/** Nightly reconcile (plan §6): post_count from truth. */
export async function recountTagCounts() {
  await dbReady();
  await db.execute(sql`
    update tags set post_count = coalesce((
      select count(*) from post_tags where post_tags.tag_id = tags.id
    ), 0)`);
}

export async function listTags(limit = 500) {
  await dbReady();
  const rows = await db.select().from(tags).orderBy(gte(tags.postCount, 0), sql`${tags.postCount} DESC`, tags.name).limit(limit);
  return rows;
}

export async function setTagCategory(tagId: number, category: TagCategory) {
  await dbReady();
  await db.update(tags).set({ category }).where(eq(tags.id, tagId));
}
