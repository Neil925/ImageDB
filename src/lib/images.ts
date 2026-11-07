import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp, { type Metadata } from "sharp";
import { LARGE_WIDTH, THUMB_WIDTH, WEB_DIR } from "@/lib/config";
import { largeRelPath, originalRelPath, thumbRelPath } from "@/lib/media";

const FORMAT_EXT: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  avif: "avif",
};

export interface ProcessedImage {
  sha256: string;
  originalPath: string;
  thumbPath: string;
  largePath: string | null;
  width: number;
  height: number;
  filesize: number;
  mime: string;
}

export class UnsupportedImageError extends Error {}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Validate + write the original, generate grid thumb and large webp.
 * Content-addressed: re-writing identical bytes is a no-op.
 */
export async function processImage(buf: Buffer): Promise<ProcessedImage> {
  const hash = sha256Hex(buf);

  let meta: Metadata;
  try {
    meta = await sharp(buf, { animated: false }).metadata();
  } catch {
    throw new UnsupportedImageError("not a readable image");
  }
  const format = meta.format ?? "";
  const ext = FORMAT_EXT[format];
  if (!ext || !meta.width || !meta.height) {
    throw new UnsupportedImageError(`unsupported image format: ${format || "unknown"}`);
  }

  const originalRel = originalRelPath(hash, ext);
  const thumbRel = thumbRelPath(hash);
  const isGif = format === "gif";
  const largeRel = isGif ? null : largeRelPath(hash);

  const write = async (rel: string, data: Buffer | (() => Promise<Buffer>)) => {
    const abs = path.join(WEB_DIR, rel);
    if (fs.existsSync(abs)) return;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const bytes = typeof data === "function" ? await data() : data;
    const tmp = `${abs}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, abs);
  };

  await write(originalRel, buf);

  await write(thumbRel, async () =>
    sharp(buf)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  );

  if (largeRel) {
    await write(largeRel, async () =>
      sharp(buf)
        .resize(LARGE_WIDTH, LARGE_WIDTH, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
    );
  }

  return {
    sha256: hash,
    originalPath: originalRel,
    thumbPath: thumbRel,
    largePath: largeRel,
    width: meta.width,
    height: meta.height,
    filesize: buf.length,
    mime: `image/${format}`,
  };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
