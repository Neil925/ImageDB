import type { Rating, TagCategory } from "@/db/schema";

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function tagCategoryClass(category: TagCategory): string {
  return `tag-${category}`;
}

export function ratingClass(rating: Rating): string {
  return `rating-${rating}`;
}

export const RATING_SHORT: Record<Rating, string> = {
  general: "G",
  sensitive: "S",
  questionable: "Q",
  explicit: "E",
};
