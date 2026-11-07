import Link from "next/link";
import type { posts } from "@/db/schema";
import { mediaUrl } from "@/lib/media";
import { RATING_SHORT, ratingClass } from "@/lib/format";

export default function PostGrid({
  rows,
  nextHref,
  unresolved,
}: {
  rows: (typeof posts.$inferSelect)[];
  nextHref?: string | null;
  unresolved?: string[];
}) {
  if (!rows.length) {
    return <p className="py-12 text-center text-zinc-500">No posts found.</p>;
  }
  return (
    <>
      {unresolved && unresolved.length > 0 && (
        <p className="mb-3 rounded bg-yellow-950/60 px-3 py-2 text-sm text-yellow-300">
          Unknown tag{unresolved.length > 1 ? "s" : ""}, ignored:{" "}
          {unresolved.map((t) => (
            <Link key={t} href={`/tags?${new URLSearchParams({ q: t })}`} className="underline">
              {t}
            </Link>
          ))}
        </p>
      )}
      <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/posts/${p.id}`}
            className="group relative mb-2 block break-inside-avoid overflow-hidden rounded"
          >
            <img
              src={mediaUrl(p.thumbPath)}
              width={p.width}
              height={p.height}
              loading="lazy"
              alt={`post ${p.id}`}
              className="h-auto w-full transition-opacity group-hover:opacity-80"
            />
            <span
              className={`absolute left-1 top-1 rounded px-1.5 text-xs font-bold text-white ${ratingClass(p.rating)}`}
              title={p.rating}
            >
              {RATING_SHORT[p.rating]}
            </span>
          </Link>
        ))}
      </div>
      {nextHref && (
        <div className="mt-6 flex justify-center">
          <Link
            href={nextHref}
            className="rounded bg-zinc-800 px-6 py-2 text-sm font-medium hover:bg-zinc-700"
          >
            Next →
          </Link>
        </div>
      )}
    </>
  );
}
