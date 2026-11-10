import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { WEB_DIR } from "@/lib/config";
import { handleUpload } from "@/lib/upload";
import { handleMedia } from "@/worker/handlers";
import { UnsupportedImageError } from "@/lib/images";
import { gridRelPath, previewRelPath, thumbRelPath } from "@/lib/media";
import { fixtures, makeImage } from "./fixtures";

let fx: Awaited<ReturnType<typeof fixtures>>;

beforeAll(async () => {
  fx = await fixtures();
});

describe("upload + media pipeline (plan P1)", () => {
  it("exact dedupe: identical bytes return the existing post", async () => {
    const buf = await makeImage(7777);
    const first = await handleUpload({ buf, uploaderId: fx.uploaderId, tags: ["dedupe_test"] });
    const again = await handleUpload({ buf, uploaderId: fx.uploaderId, tags: ["dedupe_test"] });
    expect(again.duplicate?.postId).toBe(first.postId);
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.sha256, (await db.select({ sha: posts.sha256 }).from(posts).where(eq(posts.id, first.postId)))[0].sha));
    expect(rows).toHaveLength(1);
  });

  it("upload → three derivatives, EXIF gone, dimensions + phash stored", async () => {
    const buf = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="hsl(30 60% 40%)"/><text x="10" y="200" font-size="40" fill="white">EXIF</text></svg>'))
      .withExif({ IFD0: { Make: "ShouldDie" } })
      .jpeg()
      .toBuffer();
    const up = await handleUpload({ buf, uploaderId: fx.uploaderId, tags: ["media_test"] });
    await handleMedia({ postId: up.postId });

    const row = (await db.select().from(posts).where(eq(posts.id, up.postId)))[0];
    expect(row.width).toBe(640);
    expect(row.height).toBe(400);
    expect(row.phash).toMatch(/^[01]{64}$/);
    for (const rel of [thumbRelPath(row.sha256), gridRelPath(row.sha256), previewRelPath(row.sha256)]) {
      expect(fs.existsSync(path.join(WEB_DIR, rel))).toBe(true);
    }
    const preview = await sharp(path.join(WEB_DIR, previewRelPath(row.sha256))).metadata();
    expect(preview.exif).toBeUndefined(); // metadata stripped by re-encode
    expect(preview.width).toBeLessThanOrEqual(1600);
  });

  it("near-dupe (re-encoded copy) is flagged, never auto-deleted", async () => {
    const orig = await makeImage(4242);
    const a = await handleUpload({ buf: orig, uploaderId: fx.uploaderId, tags: ["nearly_same"] });
    await handleMedia({ postId: a.postId });
    await db.update(posts).set({ status: "active" }).where(eq(posts.id, a.postId));

    const reencoded = await sharp(orig).jpeg({ quality: 25 }).toBuffer();
    const b = await handleUpload({ buf: reencoded, uploaderId: fx.uploaderId, tags: ["nearly_same"] });
    expect(b.duplicate).toBeUndefined(); // different bytes: NOT an exact dedupe
    await handleMedia({ postId: b.postId });
    const row = (await db.select({ status: posts.status }).from(posts).where(eq(posts.id, b.postId)))[0];
    expect(row.status).toBe("flagged");
  });

  it("gif: thumb + grid exist, no preview webp (original stays the viewer)", async () => {
    const gif = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="teal"/></svg>')).gif().toBuffer();
    const up = await handleUpload({ buf: gif, uploaderId: fx.uploaderId, tags: ["gif_test"] });
    await handleMedia({ postId: up.postId });
    const row = (await db.select().from(posts).where(eq(posts.id, up.postId)))[0];
    expect(fs.existsSync(path.join(WEB_DIR, thumbRelPath(row.sha256)))).toBe(true);
    expect(fs.existsSync(path.join(WEB_DIR, gridRelPath(row.sha256)))).toBe(true);
    expect(fs.existsSync(path.join(WEB_DIR, previewRelPath(row.sha256)))).toBe(false);
  });

  it("SVG is refused; non-images refused by magic-byte sniffing", async () => {
    await expect(
      handleUpload({ buf: Buffer.from("<svg></svg>"), uploaderId: fx.uploaderId, tags: [] }),
    ).rejects.toThrow(UnsupportedImageError);
    await expect(
      handleUpload({ buf: Buffer.from("%PDF-1.7 fake"), uploaderId: fx.uploaderId, tags: [] }),
    ).rejects.toThrow(UnsupportedImageError);
  });
});
