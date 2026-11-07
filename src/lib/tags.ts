import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postTags, tagAliases, tagImplications, tags } from "@/db/schema";
import type { TagCategory } from "@/db/schema";

/** Booru-style normalization: lowercase, spaces -> underscores, printable ASCII only. */
export function normalizeTag(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  s = s.replace(/[^\x21-\x7e]/g, "");
  s = s.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  if (!s || s.length > 100) return null;
  return s;
}

export function findTagByName(name: string) {
  return db.select().from(tags).where(eq(tags.name, name)).get();
}

export function resolveTagName(input: string) {
  const name = normalizeTag(input);
  if (!name) return null;
  const alias = db
    .select({ tag: tags })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(eq(tagAliases.alias, name))
    .get()?.tag;
  return alias ?? findTagByName(name) ?? null;
}

export function createTag(name: string, category: TagCategory = "general") {
  return db.insert(tags).values({ name, category }).returning().get();
}

export function getOrCreateTag(name: string) {
  return findTagByName(name) ?? createTag(name);
}

/** Transitive closure of implications (depth-capped). */
export function expandImplications(tagIds: number[]): number[] {
  const seen = new Set(tagIds);
  let frontier = [...tagIds];
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const rows = db
      .select({ implied: tagImplications.impliedTagId })
      .from(tagImplications)
      .where(
        sql`${tagImplications.tagId} IN (${sql.join(
          frontier.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .all();
    frontier = rows.map((r) => r.implied).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  return [...seen];
}

export interface ApplyTagsResult {
  applied: string[];
  created: string[];
}

/**
 * Attach (creating when unknown) a space-separated tag string to a post.
 * Expands implications, maintains post_count, activates pending posts.
 */
export function applyTagsToPost(postId: number, rawTags: string[]): ApplyTagsResult {
  const created: string[] = [];
  const ids: number[] = [];
  for (const raw of rawTags) {
    const name = normalizeTag(raw);
    if (!name) continue;
    let tag = resolveTagName(name);
    if (!tag) {
      tag = createTag(name);
      created.push(name);
    }
    ids.push(tag.id);
  }
  if (!ids.length) return { applied: [], created };

  const expanded = expandImplications(ids);
  const added = db.transaction((tx) => {
    const addedIds: number[] = [];
    for (const tagId of expanded) {
      const res = tx
        .insert(postTags)
        .values({ postId, tagId })
        .onConflictDoNothing()
        .run();
      if (res.changes > 0) addedIds.push(tagId);
    }
    if (addedIds.length) {
      tx.update(tags)
        .set({ postCount: sql`${tags.postCount} + 1` })
        .where(
          sql`${tags.id} IN (${sql.join(addedIds.map((id) => sql`${id}`), sql`, `)})`,
        )
        .run();
      // a pending post becomes visible once it has tags
      tx.update(posts)
        .set({ status: "active", updatedAt: Date.now() })
        .where(sql`${posts.id} = ${postId} AND ${posts.status} = 'pending'`)
        .run();
    }
    return addedIds;
  });

  const applied = db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId))
    .all()
    .map((r) => r.name);

  return { applied, created: created.filter((n) => added.length > 0) };
}

export interface AutocompleteHit {
  name: string;
  postCount: number;
  category: TagCategory;
  viaAlias?: string;
}

export function autocompleteTags(query: string, limit = 12): AutocompleteHit[] {
  const name = normalizeTag(query);
  if (!name) return [];
  const prefix = `${name.replace(/[%*]$/g, "")}%`;

  const direct = db
    .select()
    .from(tags)
    .where(like(tags.name, prefix))
    .orderBy(sql`${tags.postCount} DESC`, tags.name)
    .limit(limit)
    .all();

  const viaAlias = db
    .select({ alias: tagAliases.alias, tag: tags })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(like(tagAliases.alias, prefix))
    .limit(limit)
    .all();

  const hits: AutocompleteHit[] = [
    ...direct.map((t) => ({ name: t.name, postCount: t.postCount, category: t.category })),
    ...viaAlias.map((a) => ({
      name: a.tag.name,
      postCount: a.tag.postCount,
      category: a.tag.category,
      viaAlias: a.alias,
    })),
  ];
  const seen = new Set<string>();
  return hits
    .filter((h) => !seen.has(h.name) && seen.add(h.name) !== undefined)
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, limit);
}

export function tagsForPost(postId: number) {
  return db
    .select({ id: tags.id, name: tags.name, category: tags.category, postCount: tags.postCount })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId))
    .orderBy(sql`${tags.postCount} DESC`)
    .all();
}

export function setAliases(tagId: number, aliases: string[]) {
  db.transaction((tx) => {
    tx.delete(tagAliases).where(eq(tagAliases.tagId, tagId)).run();
    for (const raw of aliases) {
      const alias = normalizeTag(raw);
      if (!alias || alias === resolveTagName(alias)?.name) continue;
      tx.insert(tagAliases).values({ alias, tagId }).onConflictDoNothing().run();
    }
  });
}

export function aliasesFor(tagId: number) {
  return db
    .select({ alias: tagAliases.alias })
    .from(tagAliases)
    .where(and(eq(tagAliases.tagId, tagId)))
    .all()
    .map((r) => r.alias);
}
