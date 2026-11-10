/**
 * Dev/test Postgres without Docker: embedded-postgres downloads real PG 18
 * binaries and runs them as neilbot on port 55432, data in ./data/pgdev.
 *
 *   npm run db:dev   → prints the DATABASE_URL to use
 */
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";

const DIR = process.env.IMAGEDB_PGDEV_DIR ?? "./data/pgdev";
const PORT = Number(process.env.IMAGEDB_PGPORT ?? 55432);

const exists = fs.existsSync(`${DIR}/PG_VERSION`);
if (!exists) fs.mkdirSync(DIR, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: "imagedb",
  password: "imagedb",
  port: PORT,
  persistent: true,
});

if (!exists) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("imagedb");
} catch {
  /* already exists */
}
console.log(`DATABASE_URL=postgres://imagedb:imagedb@localhost:${PORT}/imagedb`);
console.log(`(data: ${DIR}) — Ctrl-C stops the server`);

process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
