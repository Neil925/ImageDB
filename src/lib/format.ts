import { RATING_NAME, RATING_VALUE, type Rating, type TagCategory } from "@/db/schema";
import { mediaUrl, originalRelPath, thumbRelPath, gridRelPath, previewRelPath } from "@/lib/media";

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function tagCategoryClass(category: TagCategory): string {
  return `tag-${category}`;
}

export function ratingName(value: number): Rating {
  return RATING_NAME[value] ?? "general";
}

export function ratingValue(name: string): Rating {
  return (RATING_VALUE[name as Rating] !== undefined ? (name as Rating) : "general");
}

export function ratingClass(value: number): string {
  return `rating-${ratingName(value)}`;
}

export const RATING_SHORT: Record<Rating, string> = {
  general: "G",
  sensitive: "S",
  questionable: "Q",
  explicit: "E",
};

export const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

// Media URLs are derived from the content hash (plan §9) — no path columns.
export const thumbUrl = (sha: string) => mediaUrl(thumbRelPath(sha));
export const gridUrl = (sha: string) => mediaUrl(gridRelPath(sha));
export const previewUrl = (sha: string) => mediaUrl(previewRelPath(sha));
export const originalUrl = (sha: string, mime: string) =>
  mediaUrl(originalRelPath(sha, MIME_EXT[mime] ?? "bin"));

/** The viewer URL: GIFs show the animated original; everything else the 1600px preview. */
export const viewerUrl = (sha: string, mime: string) =>
  mime === "image/gif" ? originalUrl(sha, mime) : previewUrl(sha);
