import { db, dbReady } from "@/db";
import { pools } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { withApi, json } from "../../guard";

/** GET /api/v1/pools/:id — ordered post ids (plan §11). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(req, async () => {
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id)) return json({ error: "bad id" }, { status: 400 });
    await dbReady();
    const p = await db.select().from(pools).where(eq(pools.id, Number(id))).limit(1);
    if (!p[0]) return json({ error: "not found" }, { status: 404 });
    const rowsRes = await db.execute(sql`
      select post_id as "postId", position from pool_posts
      where pool_id = ${p[0].id} order by position asc`);
    const items = ((rowsRes as unknown as { rows?: { postId: string | number; position: string | number }[] }).rows) ?? [];
    return json({
      pool: { id: p[0].id, name: p[0].name, description: p[0].description, category: p[0].category },
      posts: items.map((r) => ({ id: Number(r.postId), position: Number(r.position) })),
    });
  });
}
