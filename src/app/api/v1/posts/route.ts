import { sql } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { RATING_NAME } from "@/db/schema";
import { POSTS_PER_PAGE } from "@/lib/config";
import { searchPosts } from "@/lib/search";
import { thumbRelPath, gridRelPath, previewRelPath, mediaUrl } from "@/lib/media";
import { withApi, json } from "../guard";

/**
 * GET /api/v1/posts?tags=…&limit=40&cursor=… (plan §11)
 * Post list: id, dimensions, rating, score, tag names, thumb/preview URLs, count_capped.
 */
export async function GET(req: Request) {
  return withApi(req, async () => {
    const url = new URL(req.url);
    const query = url.searchParams.get("tags") ?? "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? POSTS_PER_PAGE) || POSTS_PER_PAGE, 1), 100);
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const result = await searchPosts({ query, cursor, limit });
    if (result.error) return json({ error: result.error }, { status: 400 });
    await dbReady();
    const ids = result.rows.map((p) => p.id);
    const tagRows = ids.length
      ? ((await db.execute(sql`
          select pt.post_id as "postId", t.name
          from post_tags pt join tags t on t.id = pt.tag_id
          where pt.post_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
          order by t.post_count desc`)) as unknown as { rows?: { postId: number; name: string }[] })
      : ({ rows: [] } as unknown as { rows: { postId: number; name: string }[] });
    const byId = new Map<number, string[]>();
    for (const r of tagRows.rows ?? []) {
      byId.set(Number(r.postId), [...(byId.get(Number(r.postId)) ?? []), String(r.name)]);
    }

    return json({
      count: result.count,
      count_capped: result.countCapped,
      unresolved: result.unresolved,
      next_cursor: result.nextCursor,
      posts: result.rows.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        rating: RATING_NAME[p.rating] ?? "general",
        score: p.score,
        tags: byId.get(p.id) ?? [],
        thumb_url: mediaUrl(thumbRelPath(p.sha256)),
        grid_url: mediaUrl(gridRelPath(p.sha256)),
        preview_url: mediaUrl(previewRelPath(p.sha256)),
      })),
    });
  });
}
