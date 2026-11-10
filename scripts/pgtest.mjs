import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: "/tmp/embpg",
  user: "postgres",
  password: "imagedb-test",
  port: 55432,
  persistent: true,
});
await pg.initialise();
await pg.start();
await pg.createDatabase("imagedb");
await pg.getPersistentConnectionToLocal("imagedb");
console.log("started ok");
await pg.stop();
console.log("stopped ok");
