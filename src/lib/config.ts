import path from "path";

/** Root data directory: sqlite db + media files. One folder = the whole board. */
export const DATA_DIR = process.env.IMAGEDB_DATA_DIR ?? path.join(process.cwd(), "data");

/** Everything under here is served at /media/* and must stay immutable. */
export const WEB_DIR = path.join(DATA_DIR, "web");

export const DB_FILE = path.join(DATA_DIR, "imagedb.db");

export const THUMB_WIDTH = 300;
export const LARGE_WIDTH = 1200;
export const POSTS_PER_PAGE = 24;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
export const WILDCARD_MAX_TAGS = 32;
