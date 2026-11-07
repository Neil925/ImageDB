import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { DB_FILE } from "@/lib/config";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __imagedb?: ReturnType<typeof createDb> };

function createDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  // containers self-provision on first boot; dev keeps using `npm run db:push`
  if (process.env.IMAGEDB_MIGRATE === "1") {
    migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  }
  return db;
}

export const db = globalForDb.__imagedb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__imagedb = db;

export type Db = typeof db;
