/**
 * P2 acceptance bench (plan §7.2 / §14): at 100k posts a two-tag query must be
 * under 150 ms, and EXPLAIN must show index scans on post_tags indexes with no
 * sequential scan of posts.
 */
import { db, dbReady } from "../src/db";
import { searchPosts } from "../src/lib/search";

const QUERIES: [string, number?][] = [
  ["load_tag_1500 load_tag_1800", 3], // two rare-tag AND (the §7.2 acceptance query shape)
  ["load_tag_0", 1], // single ultra-common tag (zipf head)
  ["load_tag_1500 -load_tag_1800", 3], // AND NOT
  ["load_tag_1*", 1], // wildcard
  ["load_tag_1200 load_tag_1500 load_tag_1900", 4], // three-tag AND
  ["load_tag_1200 sort:score", 2], // sort by score
  ["load_tag_1200 rating:general", 3],
  ["load_tg_1200~", 1], // fuzzy (misspelled)
  ["( load_tag_1500 | load_tag_1501 )", 2], // OR group
];

async function main() {
  await dbReady();
  const total = await db.execute("select count(*)::int as n from posts");
  console.log(`posts: ${(total as unknown as { rows: { n: number }[] }).rows[0].n}`);

  let worst = 0;
  for (const [q, reps] of QUERIES) {
    const times: number[] = [];
    let last = 0;
    let cnt: number | null = null;
    for (let i = 0; i < (reps ?? 1); i++) {
      const t0 = performance.now();
      const res = await searchPosts({ query: q, limit: 24 });
      last = res.rows.length;
      cnt = res.count;
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const max = times[times.length - 1];
    worst = Math.max(worst, max);
    console.log(
      `${q.padEnd(40)} n=${last} count=${cnt ?? ""} max=${max.toFixed(1)}ms p50=${times[times.length >> 1].toFixed(1)}ms`,
    );
  }

  // EXPLAIN on the two-tag query shape (raw SQL mirrors the compiled form).
  const explain = await db.execute(`
    explain (analyze, buffers)
    select p.* from posts p
    where p.id in (select post_id from post_tags where tag_id = (select id from tags where name = 'load_tag_1500'))
      and p.id in (select post_id from post_tags where tag_id = (select id from tags where name = 'load_tag_1800'))
    order by p.created_at desc, p.id desc limit 25
  `);
  const plan = (explain as unknown as { rows: { "QUERY PLAN": string }[] }).rows
    .map((r) => r["QUERY PLAN"])
    .join("\n");
  const seqScan = /Seq Scan on posts/.test(plan);
  const indexScan = /Index .*Scan using post_tags_tag_idx|Index Only Scan using post_tags_tag_idx|Bitmap.*post_tags_tag_idx/.test(plan);
  console.log("\n--- EXPLAIN two-tag ---");
  console.log(plan.split("\n").slice(0, 6).join("\n"));
  console.log(`\nseq scan on posts: ${seqScan ? "YES (FAIL)" : "no"}  |  post_tags_tag_idx used: ${indexScan ? "yes" : "NO (check plan)"}`);
  console.log(`\nWORST query: ${worst.toFixed(1)}ms  ${worst < 150 ? "— under 150ms ✓" : "— OVER 150ms ✗"}`);
  process.exit(worst < 150 && !seqScan ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
