import { PgBoss } from "pg-boss";
import { DATABASE_URL } from "@/lib/config";

/**
 * pg-boss singleton (plan §4): durable queue inside Postgres, no Redis.
 * The Next app publishes; `npm run worker` (separate process) consumes.
 */
const globalForBoss = globalThis as unknown as {
  __imagedbBoss?: PgBoss;
  __imagedbBossStart?: Promise<void>;
};

export type MediaJob = { postId: number };
export type BackfillJob = { antecedentId: number; consequentId: number };
export type RecountJob = Record<string, never>;

export const MEDIA_QUEUE = "media";
export const BACKFILL_QUEUE = "backfill-implication";
export const RECOUNT_QUEUE = "recount-tags";

export function getBoss(): PgBoss {
  if (!globalForBoss.__imagedbBoss) {
    globalForBoss.__imagedbBoss = new PgBoss({ connectionString: DATABASE_URL, schema: "pgboss" });
  }
  return globalForBoss.__imagedbBoss;
}

export async function bossReady(): Promise<PgBoss> {
  const boss = getBoss();
  globalForBoss.__imagedbBossStart ??= (async () => {
    boss.on("error", (err) => console.error("[pg-boss]", err.message));
    await boss.start();
    await boss.createQueue(MEDIA_QUEUE, { retryLimit: 3, retryBackoff: true });
    await boss.createQueue(BACKFILL_QUEUE, { retryLimit: 3, retryBackoff: true });
    await boss.createQueue(RECOUNT_QUEUE);
  })();
  await globalForBoss.__imagedbBossStart;
  return boss;
}

export async function publishMedia(postId: number) {
  const boss = await bossReady();
  await boss.send(MEDIA_QUEUE, { postId } satisfies MediaJob);
}

export async function publishBackfill(antecedentId: number, consequentId: number) {
  const boss = await bossReady();
  await boss.send(BACKFILL_QUEUE, { antecedentId, consequentId } satisfies BackfillJob);
}
