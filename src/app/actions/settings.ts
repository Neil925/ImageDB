"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole, currentUser } from "@/lib/authz";
import { createApiKey, revokeApiKey } from "@/lib/apikeys";
import { ROLES, users } from "@/db/schema";
import { db, dbReady } from "@/db";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";

/**
 * Own API key (any signed-in user). The plaintext is shown exactly once via
 * a redirect flash param — LAN-only deployment, never stored server-side.
 */
export async function createKeyAction(formData: FormData) {
  const user = await requireRole("viewer");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("name required");
  const { key, id } = await createApiKey(user.id, name);
  await audit(user.id, "apikey.create", "api_key", id, { name });
  revalidatePath("/settings");
  redirect(`/settings?created=${encodeURIComponent(key)}`);
}

export async function revokeKeyAction(formData: FormData) {
  const user = await requireRole("viewer");
  const id = Number(formData.get("keyId"));
  if (!Number.isInteger(id)) throw new Error("bad keyId");
  await revokeApiKey(id, user.id);
  await audit(user.id, "apikey.revoke", "api_key", id);
  revalidatePath("/settings");
}

/** Users, roles — admin only (plan §10). */
export async function setUserRoleAction(formData: FormData) {
  const actor = await requireRole("admin");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !ROLES.includes(role as (typeof ROLES)[number])) throw new Error("bad role");
  await dbReady();
  await db.update(users).set({ role: role as (typeof ROLES)[number] }).where(eq(users.id, userId));
  await audit(actor.id, "user.role-set", "user", undefined, { target: userId, role });
  revalidatePath("/settings");
}

export async function changePasswordAction(formData: FormData) {
  const user = await currentUser();
  if (!user) throw new Error("signed out");
  const { auth } = await import("@/auth");
  await auth.api.changePassword({
    headers: await headers(),
    body: {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    },
  });
  revalidatePath("/settings");
}
