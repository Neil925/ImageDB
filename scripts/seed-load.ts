/**
 * Load seed for search acceptance (plan P2/P3):
 *   "100k-post seed: two-tag query under 150 ms; EXPLAIN shows index scans"
 * Inserts synthetic rows (fake hashes — no files on disk) with Zipf tag use.
 * Usage: DATABASE_URL=... npm run seed:load -- 100000
 */
import crypto from "crypto";
import { db, dbReady } from "../src/db";
import { posts, postTags, tags } from "../src/db/schema";

const N = Number(process.argv[2] ?? 100_000);
const TAG_COUNT = 2_000;

async function main() {
  await dbReady();
  const t0 = Date.now();

  const tagIds: number[] = [];
  for (let i = 0; i < TAG_COUNT; i++) {
    const rows = await db
      .insert(tags)
      .values({ name: `load_tag_${i}` })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    if (rows[0]) tagIds.push(rows[0].id);
    else {
      const ex = await db.execute(`select id from tags where name = 'load_tag_${i}'`);
      const r = ((ex as unknown) as { rows?: { id: number }[] }).rows?.[0];
      if (r) tagIds.push(r.id);
    }
  }

  const BATCH = 1000;
  for (let start = 0; start < N; start += BATCH) {
    const values: { sha256: string; mime: string; bytes: number; rating: number; status: "active" }[] = [];
    for (let i = 0; i < Math.min(BATCH, N - start); i++) {
      values.push({
        sha256: crypto.randomBytes(32).toString("hex"),
        mime: "image/jpeg",
        bytes: 100_000 + ((start + i) % 900_000),
        rating: (start + i) % 4,
        status: "active",
      });
    }
    const inserted = await db.insert(posts).values(values).returning({ id: posts.id });
    const links: { postId: number; tagId: number }[] = [];
    for (const p of inserted) {
      const k = 1 + Math.floor(Math.random() * 8);
      const used = new Set<number>();
      for (let j = 0; j < k; j++) {
        // Zipf: low indices dominate
        const idx = Math.min(TAG_COUNT - 1, Math.floor(Math.pow(Math.random(), 3) * TAG_COUNT));
        if (!used.has(idx)) {
          used.add(idx);
          links.push({ postId: p.id, tagId: tagIds[idx] });
        }
      }
    }
    // chunk link insert
    for (let i = 0; i < links.length; i += 5000) {
      await db.insert(postTags).values(links.slice(i, i + 5000)).onConflictDoNothing();
    }
    if (start % 20_000 === 0) console.log(`  ${start}/${N} …`);
  }

  // maintain counts
  await db.execute(`
    update tags set post_count = coalesce((select count(*) from post_tags where post_tags.tag_id = tags.id),0)`);
  console.log(`load seed done: ${N} posts, ${tagIds.length} tags in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
