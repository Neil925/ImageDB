import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp, { type Metadata } from "sharp";
import { GRID_WIDTH, PREVIEW_WIDTH, THUMB_WIDTH, WEB_DIR } from "@/lib/config";
import { gridRelPath, originalRelPath, previewRelPath, thumbRelPath } from "@/lib/media";

const FORMAT_EXT: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  avif: "avif",
};

export class UnsupportedImageError extends Error {}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Magic-byte sniff (plan §9: never trust the declared Content-Type).
 * Returns the sharp format or null. SVG is refused (script vector).
 */
export function sniffFormat(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a")
    return "gif";
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "webp";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (["avif", "avis", "mif1"].includes(brand)) return "avif";
  }
  return null; // includes SVG ("<"), pdf, zip, everything else
}

/** Store the original; content-addressed so identical bytes are a no-op. */
export function writeOriginal(hash: string, ext: string, buf: Buffer): string {
  const rel = originalRelPath(hash, ext);
  const abs = path.join(WEB_DIR, rel);
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, abs);
  }
  return rel;
}

export interface Derivatives {
  width: number;
  height: number;
  thumbPath: string;
  gridPath: string;
  previewPath: string | null; // null for gif: original stays the viewer
  phash: string; // 64 char "0"/"1" string
}

async function writeWebp(buf: Buffer, width: number, rel: string): Promise<void> {
  const abs = path.join(WEB_DIR, rel);
  if (fs.existsSync(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const out = await sharp(buf, { animated: false })
    .rotate() // auto-rotate from EXIF, metadata is dropped by re-encode
    .resize(width, width, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: width <= THUMB_WIDTH ? 80 : 85 })
    .toBuffer();
  const tmp = `${abs}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, abs);
}

/**
 * dHash (64-bit): 9x8 grayscale, each pixel vs its left neighbour.
 * Resistant to resize/re-encode; Hamming distance ≤ 6 ⇒ near-dupe (plan §9).
 */
export async function dHash64(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf, { animated: false })
    .rotate()
    .grayscale()
    .normalize()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const a = data[row * info.width + col];
      const b = data[row * info.width + col + 1];
      bits += a > b ? "1" : "0";
    }
  }
  return bits;
}

/**
 * Worker-side pipeline (plan §9): EXIF-strip + ladder 200/400/1600 WebP,
 * dimensions, phash. Returns what the posts row needs.
 */
export async function processDerivatives(hash: string, ext: string): Promise<Derivatives> {
  const origAbs = path.join(WEB_DIR, originalRelPath(hash, ext));
  const buf = fs.readFileSync(origAbs);
  const meta = await sharp(buf, { animated: false }).metadata();
  if (!meta.width || !meta.height) throw new UnsupportedImageError(`unreadable original ${hash}`);

  const rotated = await sharp(buf, { animated: false }).rotate().toBuffer();
  const w: Metadata = rotated.length >= buf.length ? meta : await sharp(rotated, { animated: false }).metadata();
  const width = w.width!;
  const height = w.height!;

  const thumbPath = thumbRelPath(hash);
  const gridPath = gridRelPath(hash);
  const isGif = ext === "gif";
  const previewPath = isGif ? null : previewRelPath(hash);

  await writeWebp(buf, THUMB_WIDTH, thumbPath);
  await writeWebp(buf, GRID_WIDTH, gridPath);
  if (previewPath) await writeWebp(buf, PREVIEW_WIDTH, previewPath);

  const phash = await dHash64(buf);
  return { width, height, thumbPath, gridPath, previewPath, phash };
}
