import PostGrid from "@/components/PostGrid";
import { POSTS_PER_PAGE } from "@/lib/config";
import { searchPosts } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tags?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.tags ?? "";
  const result = searchPosts({ query, cursor: sp.cursor, limit: POSTS_PER_PAGE });
  const nextHref = result.nextCursor
    ? `/?tags=${encodeURIComponent(query)}&cursor=${result.nextCursor}`
    : null;

  return (
    <>
      {query && (
        <h1 className="mb-4 text-xl font-semibold">
          Posts <span className="text-zinc-400">tagged</span>{" "}
          <span className="text-sky-400">{query}</span>
        </h1>
      )}
      <PostGrid rows={result.rows} nextHref={nextHref} unresolved={result.unresolved} />
    </>
  );
}
