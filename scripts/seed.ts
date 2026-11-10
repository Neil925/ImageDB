/**
 * Dev seed for Postgres (plan acceptance: seeded data + worker pipeline).
 * Creates seed users (admin/uploader/moderator), N synthetic images run
 * through the REAL pipeline (sha256, original write, tag soup, derivatives,
 * dHash), one alias, one implication + backfill, one pool, one duplicate.
 */
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, dbReady } from "../src/db";
import { accounts, posts, users } from "../src/db/schema";
import { WEB_DIR } from "../src/lib/config";
import { applyTagsToPost, addImplication, setAliases, getOrCreateTag } from "../src/lib/tags";
import { processDerivatives, sha256Hex, writeOriginal } from "../src/lib/images";
import { createPool, addPostToPool } from "../src/lib/pools";

const N = Number(process.argv[2] ?? 500);
const RATINGS = [0, 0, 0, 0, 1, 1, 2, 3]; // mostly general

const TAGS = [
  "sky", "clouds", "sunset", "night", "city", "lights", "nature", "forest", "water",
  "reflection", "snow", "mountains", "street", "neon", "fog", "stars", "moon",
  "cat", "cat_ears", "animal_ears", "generated", "test_pattern",
];

async function makeImage(i: number): Promise<Buffer> {
  const w = 320 + ((i * 37) % 400);
  const h = 240 + ((i * 53) % 400);
  const hue = (i * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="hsl(${hue} 60% 40%)"/>
    <circle cx="${(i * 13) % w}" cy="${(i * 7) % h}" r="${Math.min(w, h) / 3}" fill="hsl(${(hue + 120) % 360} 70% 60%)"/>
    <text x="10" y="${h - 10}" font-size="20" fill="white">#${i}</text>
  </svg>`;
  return sharp(Buffer.from(svg))
    .withExif({ IFD0: { Make: "SeedCam", Model: "EXIF-should-be-stripped" } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function upsertUser(name: string, role: string) {
  const existing = await db.select().from(users).where(eq(users.name, name)).limit(1);
  if (existing[0]) return existing[0];
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name, email: `${name}@example.invalid`, role: role as never });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: "seed-no-login", // seeds don't sign in; use /signup in dev
  });
  return { id };
}

async function main() {
  await dbReady();
  fs.mkdirSync(WEB_DIR, { recursive: true });

  const admin = await upsertUser("seed-admin", "admin");
  const uploader = await upsertUser("seed-uploader", "uploader");
  const mod = await upsertUser("seed-mod", "moderator");

  const catTag = await getOrCreateTag("cat");

  let created = 0;
  for (let i = 0; i < N; i++) {
    const buf = await makeImage(i);
    const hash = sha256Hex(buf);
    const dup = await db.select({ id: posts.id }).from(posts).where(eq(posts.sha256, hash)).limit(1);
    if (dup[0]) continue;
    writeOriginal(hash, "jpg", buf);
    const inserted = await db
      .insert(posts)
      .values({
        sha256: hash,
        mime: "image/jpeg",
        bytes: buf.length,
        rating: RATINGS[i % RATINGS.length],
        uploaderId: uploader.id,
        status: "pending",
      })
      .returning({ id: posts.id });
    const postId = inserted[0].id;

    // Zipf-ish tag soup
    const tagsForPost: string[] = [];
    for (let k = 1; k <= 1 + (i % 5); k++) {
      const idx = Math.floor(Math.pow(Math.random(), 2) * TAGS.length);
      tagsForPost.push(TAGS[idx]);
    }
    await applyTagsToPost(postId, tagsForPost);

    // run the worker pipeline inline for the seed
    const der = await processDerivatives(hash, "jpg");
    await db
      .update(posts)
      .set({
        width: der.width,
        height: der.height,
        phash: der.phash,
        status: i % 9 === 0 ? "pending" : "active", // keep ~11% in the queue
      })
      .where(eq(posts.id, postId));
    created++;
  }

  // aliases + implication (backfill lands via the queue; also applied to new posts)
  await setAliases(catTag.id, ["kitten", "kitty"]);
  await addImplication("cat_ears", "animal_ears");

  // a pool with the first ten active posts
  const pool = await createPool("seed-set", "first ten from the seed", admin.id);
  if (pool) {
    const first = await db.select({ id: posts.id }).from(posts).where(eq(posts.status, "active")).limit(10);
    for (const p of first) await addPostToPool(pool.id, p.id);
  }

  // an extra duplicate pointing at image 0's bytes to prove dedupe
  const dupHash = sha256Hex(await makeImage(0));
  const dupExists = await db.select({ id: posts.id }).from(posts).where(eq(posts.sha256, dupHash)).limit(1);
  if (!dupExists[0]) {
    console.log("warning: image 0 missing on disk, dedupe demo skipped");
  }

  void mod;
  console.log(`seeded: ${created} new posts (+ users, alias, implication, pool) — media in ${WEB_DIR}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
