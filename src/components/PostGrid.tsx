import Link from "next/link";
import type { posts } from "@/db/schema";
import { gridUrl, ratingClass, RATING_SHORT, ratingName } from "@/lib/format";

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
            {/* eslint-disable-next-line @next/next/no-img-element -- plain img is fine; immutable cached grid webp */}
            <img
              src={gridUrl(p.sha256)}
              width={p.width ?? undefined}
              height={p.height ?? undefined}
              loading="lazy"
              alt={`post ${p.id}`}
              className="h-auto w-full transition-opacity group-hover:opacity-80"
            />
            <span
              className={`absolute left-1 top-1 rounded px-1.5 text-xs font-bold text-white ${ratingClass(p.rating)}`}
              title={ratingName(p.rating)}
            >
              {RATING_SHORT[ratingName(p.rating)]}
            </span>
            {p.status !== "active" && (
              <span className="absolute right-1 top-1 rounded bg-zinc-900/90 px-1.5 text-xs text-zinc-300">
                {p.status}
              </span>
            )}
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
