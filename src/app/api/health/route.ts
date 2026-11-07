import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + readiness for deploy health checks / container healthchecks. */
export async function GET() {
  try {
    const row = db.get<{ n: number }>(sql`select count(*) as n from posts`);
    return Response.json({ ok: true, posts: row?.n ?? 0 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "db error" },
      { status: 503 },
    );
  }
}
