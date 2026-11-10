import { eq, sql } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { poolPosts, pools, posts } from "@/db/schema";

export async function createPool(name: string, description: string | null, creatorId: string) {
  await dbReady();
  const rows = await db
    .insert(pools)
    .values({ name: name.trim(), description, creatorId })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];
  const existing = await db.select().from(pools).where(eq(pools.name, name.trim())).limit(1);
  return existing[0];
}

export async function addPostToPool(poolId: number, postId: number) {
  await dbReady();
  await db.transaction(async (tx) => {
    const max = await tx.execute(
      sql`select coalesce(max(position),0) as m from pool_posts where pool_id=${poolId}`,
    );
    const rows = ((max as unknown) as { rows?: { m: string | number }[] }).rows ?? [];
    const position = Number(rows[0]?.m ?? 0) + 1;
    await tx
      .insert(poolPosts)
      .values({ poolId, postId, position })
      .onConflictDoNothing();
  });
}

export async function removePostFromPool(poolId: number, postId: number) {
  await dbReady();
  await db.transaction(async (tx) => {
    const cur = await tx.execute(
      sql`select position from pool_posts where pool_id=${poolId} and post_id=${postId}`,
    );
    const rows = ((cur as unknown) as { rows?: { position: number }[] }).rows ?? [];
    const position = Number(rows[0]?.position ?? 0);
    await tx.delete(poolPosts).where(sql`pool_id=${poolId} and post_id=${postId}`);
    if (position > 0) {
      // close the gap so positions stay 1..n
      await tx.execute(
        sql`update pool_posts set position = position - 1 where pool_id=${poolId} and position > ${position}`,
      );
    }
  });
}

/** Swap with neighbour inside a pool (single transaction). */
export async function moveWithinPool(poolId: number, postId: number, dir: "up" | "down") {
  await dbReady();
  await db.transaction(async (tx) => {
    const cur = await tx.execute(
      sql`select position from pool_posts where pool_id=${poolId} and post_id=${postId}`,
    );
    const cRows = ((cur as unknown) as { rows?: { position: number }[] }).rows ?? [];
    const position = Number(cRows[0]?.position ?? 0);
    if (!position) return;
    const target = dir === "up" ? position - 1 : position + 1;
    if (target < 1) return;
    const nb = await tx.execute(
      sql`select post_id as "postId" from pool_posts where pool_id=${poolId} and position=${target}`,
    );
    const nRows = ((nb as unknown) as { rows?: { postId: number }[] }).rows ?? [];
    if (!nRows.length) return;
    await tx.execute(sql`update pool_posts set position=-1 where pool_id=${poolId} and post_id=${postId}`);
    await tx.execute(sql`update pool_posts set position=${position} where pool_id=${poolId} and post_id=${nRows[0].postId}`);
    await tx.execute(sql`update pool_posts set position=${target} where pool_id=${poolId} and post_id=${postId}`);
  });
}

/** Replace the whole ordering in one transaction (acceptance: ordering survives reorder). */
export async function reorderPool(poolId: number, orderedPostIds: number[]) {
  await dbReady();
  await db.transaction(async (tx) => {
    await tx.delete(poolPosts).where(eq(poolPosts.poolId, poolId));
    for (let i = 0; i < orderedPostIds.length; i++) {
      await tx.insert(poolPosts).values({ poolId, postId: orderedPostIds[i], position: i + 1 });
    }
  });
}

export async function poolWithPosts(poolId: number) {
  await dbReady();
  const p = await db.select().from(pools).where(eq(pools.id, poolId)).limit(1);
  if (!p[0]) return null;
  const rows = await db.execute(sql`
    select pp.post_id as "postId", pp.position, p.*
    from pool_posts pp join posts p on p.id = pp.post_id
    where pp.pool_id = ${poolId} and p.status = 'active'
    order by pp.position asc`);
  const raw = ((rows as unknown) as { rows?: Record<string, unknown>[] }).rows ?? [];
  const posts = raw.map((r) => ({
    ...r,
    postId: Number(r.postId),
    id: Number(r.id),
    position: Number(r.position),
  }));
  return { pool: p[0], posts };
}

export async function poolsForPost(postId: number) {
  await dbReady();
  const rows = await db.execute(sql`
    select po.id, po.name, pp.position
    from pool_posts pp join pools po on po.id = pp.pool_id
    where pp.post_id = ${postId} order by po.id`);
  const raw = ((rows as unknown) as { rows?: Record<string, unknown>[] }).rows ?? [];
  return raw.map((r) => ({ id: Number(r.id), name: String(r.name), position: Number(r.position) }));
}

export async function listPools() {
  await dbReady();
  const rows = await db.execute(sql`
    select po.*, (select count(*) from pool_posts pp where pp.pool_id = po.id) as post_count
    from pools po order by po.id desc`);
  return ((rows as unknown) as { rows?: unknown[] }).rows ?? [];
}
