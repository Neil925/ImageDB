/** Queue smoke: publish a media job, watch the separate worker process pick it up. */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, dbReady } from "../src/db";
import { posts, users } from "../src/db/schema";
import { handleUpload } from "../src/lib/upload";

async function main() {
  await dbReady();
  const buf = await sharp(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(200 60% 45%)"/></svg>'),
  )
    .jpeg()
    .toBuffer();
  const u = (await db.select({ id: users.id }).from(users).where(eq(users.name, "seed-uploader")).limit(1))[0];
  const res = await handleUpload({ buf, uploaderId: u.id, tags: ["queue_smoke"] });
  console.log(`post ${res.postId} created (pending), job queued`);
  for (let i = 0; i < 30; i++) {
    const row = (
      await db
        .select({ status: posts.status, phash: posts.phash, width: posts.width })
        .from(posts)
        .where(eq(posts.id, res.postId))
    )[0];
    if (row.phash) {
      console.log(`worker processed: status=${row.status} width=${row.width} phash=${row.phash.slice(0, 8)}…`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("worker did not process within 30s");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
