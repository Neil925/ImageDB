import Link from "next/link";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { posts, type TagCategory } from "@/db/schema";
import { humanSize } from "@/lib/images";
import { mediaUrl } from "@/lib/media";
import { formatDateTime, ratingClass, tagCategoryClass } from "@/lib/format";
import { tagsForPost } from "@/lib/tags";
import { PostActions, PostTagEditor } from "@/components/PostActions";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER: TagCategory[] = ["artist", "copyright", "character", "general", "meta"];

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) notFound();

  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) notFound();

  const postTags = tagsForPost(postId);
  const byCategory = new Map<TagCategory, typeof postTags>();
  for (const t of postTags) {
    byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  }

  const prev = db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "active"), lt(posts.id, postId)))
    .orderBy(desc(posts.id))
    .limit(1)
    .get();
  const next = db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "active"), gt(posts.id, postId)))
    .orderBy(asc(posts.id))
    .limit(1)
    .get();

  const displayPath = post.largePath ?? post.originalPath;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-sm">
            {prev && <Link href={`/posts/${prev.id}`} className="text-zinc-400 hover:text-white">← Prev</Link>}
            {next && <Link href={`/posts/${next.id}`} className="text-zinc-400 hover:text-white">Next →</Link>}
          </div>
          <PostActions postId={postId} status={post.status} />
        </div>
        {post.status !== "active" && (
          <p className="rounded bg-yellow-950/60 px-3 py-2 text-sm text-yellow-300">
            This post is {post.status === "deleted" ? "deleted" : "unlisted (pending tags)"}.
          </p>
        )}
        <img
          src={mediaUrl(displayPath)}
          width={post.width}
          height={post.height}
          alt={`post ${postId}`}
          className="mx-auto max-h-[85vh] w-auto max-w-full rounded bg-black"
        />
      </div>

      <aside className="w-full shrink-0 space-y-6 text-sm lg:w-80">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tags</h2>
          {postTags.length === 0 && <p className="text-zinc-500">No tags yet.</p>}
          {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
            <div key={cat} className="mb-2 flex flex-wrap gap-1.5">
              {byCategory.get(cat)!.map((t) => (
                <Link
                  key={t.id}
                  href={`/?tags=${encodeURIComponent(t.name)}`}
                  className={`rounded px-2 py-0.5 text-xs ${tagCategoryClass(cat)}`}
                  title={`${t.postCount} posts`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Edit tags</h2>
          <PostTagEditor postId={postId} />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-zinc-300">
            <dt className="text-zinc-500">Post</dt>
            <dd>#{post.id}</dd>
            <dt className="text-zinc-500">Posted</dt>
            <dd>{formatDateTime(post.createdAt)}</dd>
            <dt className="text-zinc-500">Size</dt>
            <dd>{humanSize(post.filesize)}</dd>
            <dt className="text-zinc-500">Dimensions</dt>
            <dd>
              {post.width}×{post.height}
            </dd>
            <dt className="text-zinc-500">Type</dt>
            <dd>{post.mime}</dd>
            <dt className="text-zinc-500">Rating</dt>
            <dd>
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${ratingClass(post.rating)}`}>
                {post.rating}
              </span>
            </dd>
            {post.sourceUrl && (
              <>
                <dt className="text-zinc-500">Source</dt>
                <dd>
                  <a href={post.sourceUrl} className="break-all text-sky-400 underline">
                    {post.sourceUrl}
                  </a>
                </dd>
              </>
            )}
          </dl>
          <a
            href={mediaUrl(post.originalPath)}
            className="mt-3 inline-block text-sky-400 underline hover:text-sky-300"
          >
            Original file
          </a>
        </section>
      </aside>
    </div>
  );
}
