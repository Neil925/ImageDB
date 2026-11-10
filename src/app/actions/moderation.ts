"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { posts } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { REJECT_REASONS } from "@/lib/moderation";

/** Moderation transitions (plan §10): every action logs prev state. */
async function transition(
  postId: number,
  to: "active" | "deleted" | "flagged",
  action: string,
  actorId: string,
  reason?: string,
) {
  const rows = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, postId)).limit(1);
  const prev = rows[0]?.status;
  if (!prev || prev === to) return;
  await db.update(posts).set({ status: to, updatedAt: new Date() }).where(eq(posts.id, postId));
  await audit(actorId, action, "post", postId, { prev, to, reason: reason || undefined });
}

function idFrom(formData: FormData): number {
  const id = Number(formData.get("postId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("bad postId");
  return id;
}

export async function approveAction(formData: FormData) {
  const user = await requireRole("moderator");
  await dbReady();
  await transition(idFrom(formData), "active", "mod.approve", user.id);
  revalidatePath("/");
  revalidatePath(`/posts/${idFrom(formData)}`);
}

export async function rejectAction(formData: FormData) {
  const user = await requireRole("moderator");
  await dbReady();
  const postId = idFrom(formData);
  const reason = String(formData.get("reason") ?? "");
  if (!REJECT_REASONS.includes(reason as (typeof REJECT_REASONS)[number])) {
    throw new Error(`reason must be one of: ${REJECT_REASONS.join(", ")}`);
  }
  await transition(postId, "deleted", "mod.reject", user.id, reason);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}

export async function flagAction(formData: FormData) {
  const user = await requireRole("moderator");
  await dbReady();
  const postId = idFrom(formData);
  await transition(postId, "flagged", "mod.flag", user.id);
  revalidatePath(`/posts/${postId}`);
}

/** Bulk operations are mandatory from day one (plan §10). */
export async function bulkApproveAction(formData: FormData) {
  const user = await requireRole("moderator");
  await dbReady();
  const postIds = formData
    .getAll("ids")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!postIds.length) return;
  if (postIds.length > 500) throw new Error("bulk limit 500");
  const rows = await db.select({ id: posts.id, status: posts.status }).from(posts).where(inArray(posts.id, postIds));
  for (const r of rows) {
    if (r.status === "pending" || r.status === "flagged") {
      await db.update(posts).set({ status: "active", updatedAt: new Date() }).where(eq(posts.id, r.id));
      await audit(user.id, "mod.approve", "post", r.id, { prev: r.status, to: "active", bulk: true });
    }
  }
  revalidatePath("/");
}

export async function deleteAction(formData: FormData) {
  // soft delete for moderators; hard delete + blob GC is admin (v2 job)
  const user = await requireRole("moderator");
  await dbReady();
  const postId = idFrom(formData);
  await transition(postId, "deleted", "mod.delete", user.id);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}

export async function restoreAction(formData: FormData) {
  const user = await requireRole("moderator");
  await dbReady();
  const postId = idFrom(formData);
  await transition(postId, "active", "mod.restore", user.id);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}
