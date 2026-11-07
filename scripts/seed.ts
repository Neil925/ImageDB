/**
 * Dev seed: generates synthetic posts (sharp-rendered gradient images),
 * a random tag vocabulary, aliases, and a few implications.
 * Usage: npm run db:push && npm run seed
 */
import { randomInt } from "crypto";
import sharp from "sharp";
import { db } from "../src/db";
import { posts, tags, tagAliases, tagImplications, RATINGS } from "../src/db/schema";
import { processImage } from "../src/lib/images";
import { applyTagsToPost, createTag, findTagByName } from "../src/lib/tags";

const ADJECTIVES = [
  "blue", "red", "green", "golden", "dark", "bright", "rainbow", "sunset",
  "neon", "pastel", "stormy", "crystal", "autumn", "midnight", "electric",
];
const SUBJECTS = [
  "sky", "forest", "ocean", "mountain", "city", "garden", "desert", "river",
  "aurora", "cave", "meadow", "harbor", "canyon", "glacier", "lagoon",
];
const EXTRA_TAGS = [
  "landscape", "gradient", "abstract", "test_pattern", "generated",
  "high_res", "wallpaper", "art", "digital_media", "sample",
];
const CHARACTERS = ["hat", "umbrella", "lantern", "cat", "parasol", "glasses"];

const pick = <T,>(arr: readonly T[]) => arr[randomInt(arr.length)];
const rnd = (n: number) => randomInt(n);

async function synthImage(): Promise<Buffer> {
  const w = 400 + rnd(1600);
  const h = 400 + rnd(1600);
  const hue1 = rnd(360);
  const hue2 = (hue1 + 60 + rnd(240)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue1}, 70%, ${30 + rnd(40)}%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 80%, ${20 + rnd(40)}%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${rnd(w)}" cy="${rnd(h)}" r="${50 + rnd(200)}"
      fill="hsl(${rnd(360)}, 60%, 50%)" opacity="0.35"/>
  </svg>`;
  const fmt = rnd(4) === 0 ? "png" : "jpeg";
  return sharp(Buffer.from(svg)).toFormat(fmt, { quality: 85 }).toBuffer();
}

async function main() {
  const existing = db.select({ id: posts.id }).from(posts).limit(1).all().length;
  if (existing) {
    console.log("Database not empty - skipping seed.");
    return;
  }

  // vocabulary
  const vocab: string[] = [];
  for (const a of ADJECTIVES) for (const s of SUBJECTS) vocab.push(`${a}_${s}`);
  const common = vocab.slice(0, 40);
  vocab.push(...EXTRA_TAGS, ...CHARACTERS.map((c) => pick(["1girl", "1boy"]) + "_" + c));

  // aliases: a few vocab terms get a doubled-first-letter alias (paste-mode typo bait)
  const aliasTargets = vocab.filter((_, i) => i % 7 === 0).slice(0, 15);

  const tagCache = new Map<string, number>();
  const ensureTag = (name: string) => {
    if (!tagCache.has(name)) tagCache.set(name, createTag(name).id);
    return tagCache.get(name)!;
  };
  for (const name of aliasTargets) {
    const tag = ensureTag(name);
    const alias = `${name.slice(0, 1)}${name}`;
    if (alias !== name && !findTagByName(alias)) {
      db.insert(tagAliases).values({ alias, tagId: tag }).onConflictDoNothing().run();
    }
  }

  // one implication: generated -> test_pattern
  const generated = ensureTag("generated");
  const testPattern = ensureTag("test_pattern");
  db.insert(tagImplications)
    .values({ tagId: generated, impliedTagId: testPattern })
    .onConflictDoNothing()
    .run();

  const N = 500;
  for (let i = 0; i < N; i++) {
    const buf = await synthImage();
    const img = await processImage(buf);

    const tagNames = new Set<string>();
    const nTags = 2 + rnd(6);
    for (let t = 0; t < nTags; t++) {
      tagNames.add(rnd(3) === 0 ? pick(common) : pick(vocab));
    }
    if (rnd(4) === 0) tagNames.add("generated");
    const rating = RATINGS[
      rnd(10) < 6 ? 0 : rnd(10) < 4 ? 1 : rnd(10) < 6 ? 2 : 3
    ];

    const createdAt = Date.now() - rnd(365 * 24 * 60 * 60 * 1000);
    const row = db
      .insert(posts)
      .values({
        ...img,
        rating,
        status: "pending", // applyTagsToPost flips to active
        sourceUrl: rnd(3) === 0 ? `https://example.com/src/${i}` : null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
      .get();

    applyTagsToPost(row.id, [...tagNames]);
    if (i % 50 === 0) console.log(`seeded ${i}/${N}`);
  }
  // make sure vocabulary tags exist for autocomplete testing
  for (const name of vocab) if (!findTagByName(name)) createTag(name);

  console.log(`Seeded ${N} posts, ${db.select({ id: tags.id }).from(tags).all().length} tags.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
