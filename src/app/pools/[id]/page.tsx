import Link from "next/link";
import { notFound } from "next/navigation";
import { poolWithPosts } from "@/lib/pools";
import { currentUser, hasRole } from "@/lib/authz";
import { viewerUrl, ratingName, ratingClass, RATING_SHORT } from "@/lib/format";
import { addToPoolAction, removeFromPoolAction, movePoolPostAction } from "@/app/actions/pools";

export const dynamic = "force-dynamic";

type PoolPost = {
  postId: number;
  position: number;
  id: number;
  sha256: string;
  width: number | null;
  height: number | null;
  mime: string;
  rating: number;
  status: string;
};

const btn = "rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700";
const inp = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm";

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const res = await poolWithPosts(Number(id));
  if (!res) notFound();
  const { pool, posts } = res;

  const user = await currentUser().catch(() => null);
  const canEdit =
    !!user && hasRole(user.role, "uploader") && (pool.creatorId === user.id || hasRole(user.role, "moderator"));
  const items = posts as unknown as PoolPost[];

  return (
    <div>
      <h1 className="text-xl font-semibold">{pool.name}</h1>
      {pool.description && <p className="mt-1 text-sm text-zinc-400">{pool.description}</p>}
      <p className="mt-1 text-sm text-zinc-500">{items.length} posts, ordered</p>

      {user && hasRole(user.role, "uploader") && (
        <form action={addToPoolAction} className="mt-4 flex gap-2">
          <input type="hidden" name="poolId" value={pool.id} />
          <input name="postId" inputMode="numeric" placeholder="post id" className={`${inp} w-28`} />
          <button className={btn}>Add post</button>
        </form>
      )}

      <div className="mt-6 space-y-4">
        {items.map((p, i) => (
          <div key={p.postId} className="flex gap-4 rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="w-40 shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- immutable cached webp */}
              <img
                src={viewerUrl(p.sha256, p.mime)}
                alt={`post ${p.postId}`}
                className="mx-auto max-h-36 w-auto rounded"
                loading="lazy"
              />
              <p className="mt-1 text-xs text-zinc-500">
                <span className={`rounded px-1 text-white ${ratingClass(p.rating)}`}>
                  {RATING_SHORT[ratingName(p.rating)]}
                </span>{" "}
                {p.width}×{p.height}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <span className="mr-2 text-zinc-500">#{p.position}</span>
                <Link href={`/posts/${p.postId}`} className="text-sky-400 hover:underline">
                  post {p.postId}
                </Link>
              </p>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  {i > 0 && (
                    <form action={movePoolPostAction}>
                      <input type="hidden" name="poolId" value={pool.id} />
                      <input type="hidden" name="postId" value={p.postId} />
                      <input type="hidden" name="dir" value="up" />
                      <button className={btn}>↑ move up</button>
                    </form>
                  )}
                  {i < items.length - 1 && (
                    <form action={movePoolPostAction}>
                      <input type="hidden" name="poolId" value={pool.id} />
                      <input type="hidden" name="postId" value={p.postId} />
                      <input type="hidden" name="dir" value="down" />
                      <button className={btn}>↓ move down</button>
                    </form>
                  )}
                  <form action={removeFromPoolAction}>
                    <input type="hidden" name="poolId" value={pool.id} />
                    <input type="hidden" name="postId" value={p.postId} />
                    <button className={`${btn} text-red-300`}>remove</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ))}
        {!items.length && <p className="text-zinc-500">Empty pool.</p>}
      </div>
    </div>
  );
}
