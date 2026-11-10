import path from "path";
import { WEB_DIR } from "@/lib/config";

/**
 * Files are content-addressed by sha256, so every media URL is immutable
 * and can be served with a 1-year cache header. Layout relative to WEB_DIR
 * (plan §9: first two byte-pairs fan out the originals):
 *   originals/ab/cd/<hash>.<ext>   original upload
 *   thumb/<hash>.webp              200px grid-entry thumb
 *   grid/<hash>.webp               400px grid image
 *   preview/<hash>.webp            1600px detail-page preview
 * GIFs keep the original for viewing; derivatives are first-frame stills.
 */
export function originalRelPath(hash: string, ext: string) {
  return `originals/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${ext}`;
}
export function thumbRelPath(hash: string) {
  return `thumb/${hash}.webp`;
}
export function gridRelPath(hash: string) {
  return `grid/${hash}.webp`;
}
export function previewRelPath(hash: string) {
  return `preview/${hash}.webp`;
}

export function mediaUrl(relPath: string) {
  return `/media/${relPath}`;
}

/** Resolve a /media/<relPath> request to an absolute path, guarding traversal. */
export function resolveWebPath(relPath: string): string | null {
  const abs = path.resolve(WEB_DIR, relPath);
  if (!abs.startsWith(path.resolve(WEB_DIR) + path.sep)) return null;
  return abs;
}
