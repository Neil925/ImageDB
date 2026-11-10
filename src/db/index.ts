import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { DATABASE_URL } from "@/lib/config";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __imagedb?: ReturnType<typeof createDb>;
  __imagedbBoot?: Promise<void>;
};

function createDb() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

const { pool, db } = globalForDb.__imagedb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__imagedb = { pool, db };

/**
 * Extensions must exist before citext/pg_trgm columns and indexes are used.
 * Containers self-provision on first boot (IMAGEDB_MIGRATE=1); dev keeps
 * `npm run db:push` but still needs extensions, so bootstrap runs on the
 * first dbReady() call — never at import time (keeps `next build` offline).
 */
async function bootstrap(): Promise<void> {
  await pool.query("create extension if not exists pg_trgm");
  await pool.query("create extension if not exists citext");
  if (process.env.IMAGEDB_MIGRATE === "1") {
    await migrate(db, { migrationsFolder: "drizzle" });
  }
}

/** Await before the first query in any entrypoint (routes, worker, scripts, tests). */
export function dbReady(): Promise<void> {
  globalForDb.__imagedbBoot ??= bootstrap();
  return globalForDb.__imagedbBoot;
}

export { db, pool };
export type Db = typeof db;
