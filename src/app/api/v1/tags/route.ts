import { autocompleteTags } from "@/lib/tags";
import { withApi, json } from "../guard";

/** GET /api/v1/tags?query=…&limit=20 — autocomplete (plan §11). */
export async function GET(req: Request) {
  return withApi(req, async () => {
    const url = new URL(req.url);
    const query = url.searchParams.get("query") ?? "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);
    const hits = await autocompleteTags(query, limit);
    return json({
      tags: hits.map((h) => ({ name: h.name, category: h.category, post_count: h.postCount })),
    });
  });
}
