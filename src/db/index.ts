import fs from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DB_FILE } from "@/lib/config";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __imagedb?: ReturnType<typeof createDb> };

function createDb() {
  fs.mkdirSync(DB_FILE.replace(/\/[^/]*$/, ""), { recursive: true });
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__imagedb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__imagedb = db;

export type Db = typeof db;
