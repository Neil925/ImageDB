import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** Every state-changing action writes here (plan §10): who, what, when, previous state. */
export async function audit(
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: number,
  meta?: unknown,
) {
  await db.insert(auditLog).values({ actorId, action, targetType, targetId, meta });
}

export async function recentAudit(limit = 100) {
  return db.select().from(auditLog).orderBy(auditLog.id).limit(limit);
}
