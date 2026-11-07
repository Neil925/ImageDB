import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tagAliases } from "@/db/schema";
import PostGrid from "@/components/PostGrid";
import { POSTS_PER_PAGE } from "@/lib/config";
import { tagCategoryClass } from "@/lib/format";
import { searchPosts, tagByName } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const [{ name }, { cursor }] = await Promise.all([params, searchParams]);
  const tag = tagByName(decodeURIComponent(name));
  if (!tag) notFound();

  const aliases = db
    .select({ alias: tagAliases.alias })
    .from(tagAliases)
    .where(eq(tagAliases.tagId, tag.id))
    .all();

  const result = searchPosts({ query: tag.name, cursor, limit: POSTS_PER_PAGE });
  const nextHref = result.nextCursor ? `/tags/${encodeURIComponent(tag.name)}?cursor=${result.nextCursor}` : null;

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">
        <span className={tagCategoryClass(tag.category) + " rounded px-2 py-1"}>{tag.name}</span>
        <span className="ml-3 text-sm font-normal text-zinc-500">
          {tag.postCount} post{tag.postCount === 1 ? "" : "s"} · {tag.category}
        </span>
      </h1>
      {aliases.length > 0 && (
        <p className="mb-4 text-sm text-zinc-500">
          Aliases: {aliases.map((a) => a.alias).join(", ")}
        </p>
      )}
      <PostGrid rows={result.rows} nextHref={nextHref} />
    </>
  );
}
