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
  const result = await searchPosts({ query, cursor: sp.cursor, limit: POSTS_PER_PAGE });
  const nextHref = result.nextCursor
    ? `/?tags=${encodeURIComponent(query)}&cursor=${result.nextCursor}`
    : null;
  const countLabel =
    result.count == null ? "" : result.countCapped ? `${result.count.toLocaleString()}+` : result.count.toLocaleString();

  return (
    <>
      {query && (
        <h1 className="mb-4 text-xl font-semibold">
          Posts <span className="text-zinc-400">matching</span>{" "}
          <span className="text-sky-400">{query}</span>{" "}
          {countLabel && <span className="text-base font-normal text-zinc-500">— {countLabel}</span>}
        </h1>
      )}
      {result.error && (
        <p className="mb-3 rounded bg-red-950/60 px-3 py-2 text-sm text-red-300">{result.error}</p>
      )}
      <PostGrid rows={result.rows} nextHref={nextHref} unresolved={result.unresolved} />
    </>
  );
}
