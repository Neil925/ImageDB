"use server";

import { revalidatePath } from "next/cache";
import { requireRole, hasRole } from "@/lib/authz";
import { createPool, addPostToPool, removePostFromPool, moveWithinPool } from "@/lib/pools";
import { db, dbReady } from "@/db";
import { pools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";

export async function createPoolAction(formData: FormData) {
  const user = await requireRole("uploader");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("name required");
  const description = String(formData.get("description") ?? "").trim() || null;
  const pool = await createPool(name, description, user.id);
  if (!pool) throw new Error("pool not created");
  await audit(user.id, "pool.create", "pool", pool.id, { name: pool.name });
  revalidatePath("/pools");
}

export async function addToPoolAction(formData: FormData) {
  const user = await requireRole("uploader");
  const poolId = Number(formData.get("poolId"));
  const postId = Number(formData.get("postId"));
  if (!Number.isInteger(poolId) || !Number.isInteger(postId)) throw new Error("bad ids");
  await addPostToPool(poolId, postId);
  await audit(user.id, "pool.add-post", "pool", poolId, { postId });
  revalidatePath(`/pools/${poolId}`);
}

export async function removeFromPoolAction(formData: FormData) {
  const user = await requireRole("uploader");
  const poolId = Number(formData.get("poolId"));
  const postId = Number(formData.get("postId"));
  await dbReady();
  const rows = await db.select({ creatorId: pools.creatorId }).from(pools).where(eq(pools.id, poolId)).limit(1);
  const isCreator = rows[0]?.creatorId === user.id;
  if (!isCreator && !hasRole(user.role, "moderator")) throw new Error("creator or moderator only");
  await removePostFromPool(poolId, postId);
  await audit(user.id, "pool.remove-post", "pool", poolId, { postId });
  revalidatePath(`/pools/${poolId}`);
}

/** Swap with neighbour — acceptance: ordering survives reorder. */
export async function movePoolPostAction(formData: FormData) {
  const user = await requireRole("uploader");
  const poolId = Number(formData.get("poolId"));
  const postId = Number(formData.get("postId"));
  const dir = String(formData.get("dir")) === "up" ? "up" : "down";
  await dbReady();
  const rows = await db.select({ creatorId: pools.creatorId }).from(pools).where(eq(pools.id, poolId)).limit(1);
  const isCreator = rows[0]?.creatorId === user.id;
  if (!isCreator && !hasRole(user.role, "moderator")) throw new Error("creator or moderator only");
  await moveWithinPool(poolId, postId, dir);
  await audit(user.id, "pool.reorder", "pool", poolId, { postId, dir });
  revalidatePath(`/pools/${poolId}`);
}
