import path from "path";
import { WEB_DIR } from "@/lib/config";

/**
 * Files are content-addressed by sha256, so every media URL is immutable
 * and can be served with a 1-year cache header. Layout relative to WEB_DIR:
 *   originals/ab/cd/<hash>.<ext>   (original upload)
 *   thumbs/<hash>.webp             (grid thumbnail)
 *   large/<hash>.webp              (detail-page resize; GIFs use original)
 */
export function originalRelPath(hash: string, ext: string) {
  return `originals/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${ext}`;
}

export function thumbRelPath(hash: string) {
  return `thumbs/${hash}.webp`;
}

export function largeRelPath(hash: string) {
  return `large/${hash}.webp`;
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
