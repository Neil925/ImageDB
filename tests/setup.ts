/**
 * Per-worker setup: fresh database + data dir + applied migrations,
 * BEFORE any src/ import reads the config.
 */
import fs from "fs";
import os from "os";
import path from "path";
import pg from "pg";

const dbName = `imagedb_test_${process.env.VITEST_POOL_ID ?? "1"}`;
const url = `postgres://imagedb:imagedb@localhost:55450/${dbName}`;

const admin = new pg.Pool({ connectionString: "postgres://imagedb:imagedb@localhost:55450/postgres" });
await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
await admin.query(`CREATE DATABASE ${dbName}`);
await admin.end();

process.env.DATABASE_URL = url;
process.env.IMAGEDB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "imagedb-test-data-"));

const { db, dbReady } = await import("../src/db");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
await dbReady();
await migrate(db, { migrationsFolder: "drizzle" });
