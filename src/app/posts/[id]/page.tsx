import Link from "next/link";
import { notFound } from "next/navigation";
import { db, dbReady } from "@/db";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser, hasRole } from "@/lib/authz";
import { tagsForPost } from "@/lib/tags";
import { poolsForPost } from "@/lib/pools";
import {
  formatDate,
  gridUrl,
  originalUrl,
  ratingClass,
  ratingName,
  RATING_SHORT,
  tagCategoryClass,
  viewerUrl,
} from "@/lib/format";
import {
  approveAction,
  rejectAction,
  flagAction,
  deleteAction,
} from "@/app/actions/moderation";
import { REJECT_REASONS } from "@/lib/moderation";
import { setPostTagsAction } from "@/app/actions/tags";
import { addToPoolAction } from "@/app/actions/pools";

export const dynamic = "force-dynamic";

const btn = "rounded px-3 py-1.5 text-sm font-medium";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dupe?: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const sp = await searchParams;
  await dbReady();
  const rows = await db.select().from(posts).where(eq(posts.id, Number(id))).limit(1);
  const post = rows[0];
  if (!post || post.status === "deleted") notFound();

  const user = await currentUser().catch(() => null);
  const canMod = !!user && hasRole(user.role, "moderator");
  const canTag = !!user && hasRole(user.role, "uploader");
  const canSeeUnapproved = canMod || (user && post.uploaderId === user.id);

  const tags = await tagsForPost(post.id);
  const pools = await poolsForPost(post.id);
  const grouped = new Map<string, typeof tags>();
  for (const t of tags) {
    grouped.set(t.category, [...(grouped.get(t.category) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        {post.status !== "active" && canSeeUnapproved && (
          <p className="mb-3 rounded bg-yellow-950/60 px-3 py-2 text-sm text-yellow-300">
            Status: {post.status}
            {post.status === "flagged" && " — likely near-duplicate; a moderator must decide"}
            {post.status === "pending" && " — waiting in the moderation queue"}
          </p>
        )}
        {sp.dupe && (
          <p className="mb-3 rounded bg-sky-950/60 px-3 py-2 text-sm text-sky-300">
            Identical bytes already existed — showing the existing post (dedupe by sha256).
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- original bytes are content-addressed; next/image adds nothing */}
        <img
          src={viewerUrl(post.sha256, post.mime)}
          width={post.width ?? undefined}
          height={post.height ?? undefined}
          alt={`post ${post.id}`}
          className="mx-auto h-auto max-h-[80vh] rounded"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${ratingClass(post.rating)}`}>
            {RATING_SHORT[ratingName(post.rating)]} {ratingName(post.rating)}
          </span>
          <span>
            {post.width}×{post.height}
          </span>
          <span>{(post.bytes / 1024 / 1024).toFixed(2)} MB</span>
          <span>{formatDate(post.createdAt)}</span>
          <Link href={originalUrl(post.sha256, post.mime)} className="text-sky-400 hover:underline">
            Original
          </Link>
          <span className="text-xs text-zinc-600">{post.sha256.slice(0, 16)}…</span>
        </div>
        {post.sourceUrl && (
          <p className="mt-2 text-sm text-zinc-400">
            Source:{" "}
            <a href={post.sourceUrl} className="text-sky-400 hover:underline" rel="nofollow">
              {post.sourceUrl}
            </a>
          </p>
        )}

        {canMod && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.status === "pending" && (
              <form action={approveAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button className={`${btn} bg-emerald-700 hover:bg-emerald-600`}>Approve</button>
              </form>
            )}
            {post.status !== "flagged" && (
              <form action={flagAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button className={`${btn} bg-yellow-700 hover:bg-yellow-600`}>Flag</button>
              </form>
            )}
            <form action={rejectAction} className="flex items-center gap-2">
              <input type="hidden" name="postId" value={post.id} />
              <select name="reason" defaultValue="duplicate" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
                {REJECT_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button className={`${btn} bg-red-800 hover:bg-red-700`}>Reject</button>
            </form>
            <form action={deleteAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button className={`${btn} bg-zinc-800 hover:bg-zinc-700`}>Soft delete</button>
            </form>
          </div>
        )}
      </div>

      <aside className="w-full space-y-4 lg:w-80">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {[...grouped.entries()].map(([cat, list]) =>
              list.map((t) => (
                <Link
                  key={t.id}
                  href={`/?tags=${encodeURIComponent(t.name)}`}
                  className={`rounded px-2 py-0.5 text-xs ${tagCategoryClass(t.category)}`}
                  title={`${t.postCount} posts`}
                >
                  {t.name}
                </Link>
              )),
            )}
          </div>
        </section>

        {pools.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Pools</h2>
            <ul className="space-y-1 text-sm">
              {pools.map((p) => (
                <li key={p.id}>
                  <Link href={`/pools/${p.id}`} className="text-sky-400 hover:underline">
                    {p.name}
                  </Link>{" "}
                  <span className="text-zinc-500">#{p.position}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canTag && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Edit tags</h2>
            <form action={setPostTagsAction} className="space-y-2">
              <input type="hidden" name="postId" value={post.id} />
              <textarea
                name="tags"
                rows={4}
                defaultValue={tags.map((t) => t.name).join(" ")}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <button className={`${btn} bg-sky-600 hover:bg-sky-500`}>Save tags</button>
            </form>
          </section>
        )}

        {canTag && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Add to pool</h2>
            <form action={addToPoolAction} className="flex gap-2">
              <input type="hidden" name="postId" value={post.id} />
              <input
                name="poolId"
                inputMode="numeric"
                placeholder="pool id"
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <button className={`${btn} bg-zinc-800 hover:bg-zinc-700`}>Add</button>
            </form>
          </section>
        )}
      </aside>
    </div>
  );
}
