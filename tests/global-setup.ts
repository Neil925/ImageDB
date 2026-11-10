import os from "os";
import path from "path";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";

export const TEST_PG_PORT = 55450;

let pg: EmbeddedPostgres;

export async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imagedb-test-pg-"));
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "imagedb",
    password: "imagedb",
    port: TEST_PG_PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  // keep the process alive: return the teardown
  return async () => {
    await pg.stop().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
