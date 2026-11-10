import os from "os";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import { processDerivatives } from "@/lib/images";
import { audit } from "@/lib/audit";
import { sql } from "drizzle-orm";
import {
  MEDIA_QUEUE,
  BACKFILL_QUEUE,
  RECOUNT_QUEUE,
  bossReady,
  type MediaJob,
  type BackfillJob,
} from "@/lib/jobs";
import { recountTagCounts } from "@/lib/tags";
import { mimeToExt } from "@/lib/upload";

/** Near-dupe threshold (plan §9): Hamming distance ≤ 6 ⇒ flagged, never auto-deleted. */
export const PHASH_DISTANCE = 6;

export async function handleMedia(job: MediaJob): Promise<void> {
  const rows = await db.select().from(posts).where(eq(posts.id, job.postId));
  const post = rows[0];
  if (!post) return; // deleted while queued
  if (post.phash) return; // already processed (phash set = pipeline done)
  if (post.status === "deleted") return;

  const ext = mimeToExt(post.mime);
  const der = await processDerivatives(post.sha256, ext);

  await db
    .update(posts)
    .set({
      width: der.width,
      height: der.height,
      phash: der.phash,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id));

  // Near-dupe check (plan §9)
  const near = (await db.execute(sql`
    select id, bit_count(phash # ${der.phash}::bit(64)) as distance
    from posts
    where status <> 'deleted' and phash is not null and id <> ${post.id}
      and bit_count(phash # ${der.phash}::bit(64)) <= ${PHASH_DISTANCE}
    order by distance asc
    limit 3`)) as unknown as { rows?: { id: number; distance: number }[] };
  const matches = near.rows ?? [];

  if (matches.length) {
    await db.update(posts).set({ status: "flagged" }).where(eq(posts.id, post.id));
    await audit(null, "media.near-dupe", "post", post.id, { closest: matches });
    return;
  }

  // Uploader role decides: moderators/admins self-approve (plan §9/§10)
  const up = post.uploaderId
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, post.uploaderId)).limit(1)
    : [];
  const selfApprove = up[0]?.role === "moderator" || up[0]?.role === "admin";
  if (selfApprove) {
    await db.update(posts).set({ status: "active" }).where(eq(posts.id, post.id));
    await audit(post.uploaderId, "media.self-approve", "post", post.id);
  }
}

export async function handleBackfill(job: BackfillJob): Promise<void> {
  // Implication backfill (plan §7.3): one statement over post_tags.
  const added = await db.execute(sql`
    with ins as (
      insert into post_tags (post_id, tag_id)
      select pt.post_id, ${job.consequentId}
      from post_tags pt
      where pt.tag_id = ${job.antecedentId}
      on conflict do nothing
      returning 1
    )
    select count(*) as n from ins`);
  const nRow = ((added as unknown) as { rows?: { n: string }[] }).rows?.[0];
  const n = Number(nRow?.n ?? 0);
  if (n > 0) {
    await db.execute(sql`
      update tags set post_count = post_count + ${n} where id = ${job.consequentId}`);
  }
  await audit(null, "tags.backfill", "tag", job.consequentId, {
    antecedentId: job.antecedentId,
    added: n,
  });
}

export async function startWorker(): Promise<void> {
  const boss = await bossReady();
  const concurrency = Math.max(1, os.cpus().length - 1); // plan §14: cap sharp CPU

  await boss.work(MEDIA_QUEUE, { localConcurrency: concurrency }, async (jobs) => {
    for (const job of jobs) await handleMedia(job.data as MediaJob);
  });
  await boss.work(BACKFILL_QUEUE, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) await handleBackfill(job.data as BackfillJob);
  });
  await boss.work(RECOUNT_QUEUE, { localConcurrency: 1 }, async () => {
    await recountTagCounts();
  });
  // Nightly count reconcile (plan §6).
  await boss.schedule(RECOUNT_QUEUE, "0 4 * * *", {});

  console.log(`[worker] ready — media concurrency ${concurrency}`);
}
