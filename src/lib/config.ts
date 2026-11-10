import path from "path";

/** Root data directory: media files. The database lives in Postgres (DATABASE_URL). */
export const DATA_DIR = process.env.IMAGEDB_DATA_DIR ?? path.join(process.cwd(), "data");

/** Everything under here is served at /media/* and must stay immutable. */
export const WEB_DIR = path.join(DATA_DIR, "web");

/** Postgres 18 with pg_trgm + citext (plan §4/§6). */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://imagedb:imagedb@localhost:5432/imagedb";

/** Derivative ladder widths (plan §9): thumb 200, grid 400, preview 1600 WebP. */
export const THUMB_WIDTH = 200;
export const GRID_WIDTH = 400;
export const PREVIEW_WIDTH = 1600;

export const POSTS_PER_PAGE = 40;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // plan §9: 50 MB cap
export const WILDCARD_MAX_IDS = 2000; // plan §7.1: expansion cap before "narrow your search"
export const MAX_TAG_TERMS = 8; // plan §7.1 rule
export const MAX_WILDCARDS = 3; // plan §7.1 rule
export const COUNT_CAP = 10_000; // plan §8.2
export const SEARCH_STATEMENT_TIMEOUT = "2s"; // plan §8.2

export const API_RATE_LIMIT_PER_MIN = 60; // plan §11
