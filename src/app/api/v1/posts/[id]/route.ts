import { sql } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { RATING_NAME } from "@/db/schema";
import { mediaUrl, originalRelPath, thumbRelPath, gridRelPath, previewRelPath } from "@/lib/media";
import { tagsForPost } from "@/lib/tags";
import { poolsForPost } from "@/lib/pools";
import { postById } from "@/lib/search";
import { withApi, json } from "../../guard";

function extFor(mime: string): string {
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" }[
      mime
    ] ?? "bin"
  );
}

/** GET /api/v1/posts/:id — one post with full tag list, pools, source (plan §11). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(req, async () => {
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id)) return json({ error: "bad id" }, { status: 400 });
    await dbReady();
    const post = await postById(Number(id));
    if (!post || post.status === "deleted") return json({ error: "not found" }, { status: 404 });
    const tags = await tagsForPost(post.id);
    const pools = await poolsForPost(post.id);
    return json({
      post: {
        id: post.id,
        sha256: post.sha256,
        mime: post.mime,
        bytes: post.bytes,
        width: post.width,
        height: post.height,
        rating: RATING_NAME[post.rating] ?? "general",
        score: post.score,
        status: post.status,
        source_url: post.sourceUrl,
        created_at: post.createdAt.toISOString(),
        tags: tags.map((t) => ({ name: t.name, category: t.category, post_count: t.postCount })),
        pools: pools.map((p) => ({ id: p.id, name: p.name, position: p.position })),
        urls: {
          original: mediaUrl(originalRelPath(post.sha256, extFor(post.mime))),
          thumb: mediaUrl(thumbRelPath(post.sha256)),
          grid: mediaUrl(gridRelPath(post.sha256)),
          preview: mediaUrl(previewRelPath(post.sha256)),
        },
      },
    });
  });
}
