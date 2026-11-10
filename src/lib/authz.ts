import { headers } from "next/headers";
import { auth, type SessionUser } from "@/auth";
import { ROLES, type Role } from "@/db/schema";

const RANK: Record<Role, number> = { viewer: 0, uploader: 1, moderator: 2, admin: 3 };

export function hasRole(actual: string, min: Role): boolean {
  const a = ROLES.includes(actual as Role) ? (actual as Role) : "viewer";
  return RANK[a] >= RANK[min];
}

/** Current signed-in user (server components / server actions). */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as { id: string; name: string; email: string; role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "viewer" };
}

export class ForbiddenError extends Error {}

/** Throws unless the current user holds at least `min`. */
export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || !hasRole(user.role, min)) {
    throw new ForbiddenError(`requires role: ${min}`);
  }
  return user;
}
