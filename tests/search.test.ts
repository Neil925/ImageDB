import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searchPosts } from "@/lib/search";
import { fixtures } from "./fixtures";

let fx: Awaited<ReturnType<typeof fixtures>>;

beforeAll(async () => {
  fx = await fixtures();
});

describe("search behavior against seeded data (plan P2)", () => {
  it("AND: cat → 3 posts", async () => {
    const r = await searchPosts({ query: "cat", limit: 40 });
    expect(r.error).toBeUndefined();
    expect(r.count).toBe(3);
    expect(r.rows).toHaveLength(3);
  });

  it("AND narrows: cat night → 1", async () => {
    const r = await searchPosts({ query: "cat night", limit: 40 });
    expect(r.count).toBe(1);
  });

  it("NOT: snow -fog → both snow posts", async () => {
    const r = await searchPosts({ query: "snow -fog", limit: 40 });
    expect(r.rows.map((p) => p.id).sort((a, b) => a - b)).toEqual([fx.postIds[5], fx.postIds[6]]);
  });

  it("OR group: ( snow ~ fog ) → 4 posts", async () => {
    const r = await searchPosts({ query: "( snow ~ fog )", limit: 40 });
    expect(r.count).toBe(4);
  });

  it("wildcard: cat* matches cat, cat_ears, animal_ears", async () => {
    const r = await searchPosts({ query: "cat*", limit: 40 });
    // posts: cat(3) + cat_ears(post0) + animal_ears(implied onto post0) → union = 3
    expect(r.count).toBe(3);
  });

  it("fuzzy: nigh~ resolves to night posts", async () => {
    const r = await searchPosts({ query: "nigh~", limit: 40 });
    expect(r.count).toBeGreaterThanOrEqual(3); // night(3) ∪ night-adjacent
  });

  it("alias at read time: kitten → cat posts", async () => {
    const r = await searchPosts({ query: "kitten", limit: 40 });
    expect(r.count).toBe(3);
  });

  it("implication was materialised: animal_ears finds the cat_ears post", async () => {
    const r = await searchPosts({ query: "animal_ears", limit: 40 });
    expect(r.rows.map((p) => p.id)).toEqual([fx.postIds[0]]);
  });

  it("rating filters", async () => {
    const explicit = await searchPosts({ query: "rating:explicit", limit: 40 });
    expect(explicit.count).toBe(0);
    const safe = await searchPosts({ query: "rating:safe", limit: 40 });
    expect(safe.rows.every((p) => p.rating === 0 || p.rating === 1)).toBe(true);
  });

  it("id: metatag", async () => {
    const min = Math.min(...fx.postIds);
    const r = await searchPosts({ query: `id:>${min}`, limit: 100 });
    expect(r.rows.every((p) => p.id > min)).toBe(true);
    expect(r.rows.length).toBe(fx.postIds.length - 1);
  });

  it("md5 prefix finds by hash", async () => {
    const one = (await db.select().from(posts).where(eq(posts.id, fx.postIds[0])))[0];
    const r = await searchPosts({ query: `md5:${one.sha256.slice(0, 12)}`, limit: 10 });
    expect(r.rows.map((p) => p.id)).toEqual([fx.postIds[0]]);
  });

  it("keyset pagination never repeats and terminates", async () => {
    const p1 = await searchPosts({ query: "cat", limit: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await searchPosts({ query: "cat", limit: 2, cursor: p1.nextCursor! });
    expect(p2.rows).toHaveLength(1);
    const overlap = p2.rows.filter((p) => p1.rows.some((q) => q.id === p.id));
    expect(overlap).toHaveLength(0);
    expect(p2.nextCursor).toBeNull();
  });

  it("sort:score orders by score desc", async () => {
    await db.execute(`update posts set score = id * 2 where id in (${fx.postIds.join(",")})`);
    const r = await searchPosts({ query: "sort:score", limit: 5 });
    const scores = r.rows.map((p) => p.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("unknown tag lands in unresolved, not an error", async () => {
    const r = await searchPosts({ query: "zzzz_nope", limit: 10 });
    expect(r.unresolved).toEqual(["zzzz_nope"]);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(0);
  });

  it("bad syntax returns a friendly error object, not a throw", async () => {
    const r = await searchPosts({ query: "rating:maybe", limit: 10 });
    expect(r.error).toMatch(/unknown rating/);
    expect(r.rows).toHaveLength(0);
  });
});
