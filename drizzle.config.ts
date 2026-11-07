import path from "path";
import { defineConfig } from "drizzle-kit";

const DATA_DIR = process.env.IMAGEDB_DATA_DIR ?? path.join(process.cwd(), "data");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: path.join(DATA_DIR, "imagedb.db") },
});
