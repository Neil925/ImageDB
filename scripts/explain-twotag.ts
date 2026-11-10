import { db, dbReady } from "../src/db";

await dbReady();
const r = (await db.execute(`
  explain (analyze, buffers)
  select p.* from posts p
  where p.id in (select post_id from post_tags where tag_id = (select id from tags where name = 'load_tag_1200'))
    and p.id in (select post_id from post_tags where tag_id = (select id from tags where name = 'load_tag_999'))
  order by p.created_at desc, p.id desc limit 25
`)) as unknown as { rows: { "QUERY PLAN": string }[] };
console.log(r.rows.map((x) => x["QUERY PLAN"]).join("\n"));
process.exit(0);
