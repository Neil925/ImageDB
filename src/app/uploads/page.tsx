import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload queue — ImageDB" };

export default function UploadsPage() {
  const pending = db
    .select()
    .from(posts)
    .where(eq(posts.status, "pending"))
    .orderBy(asc(posts.createdAt))
    .limit(100)
    .all();
  const deleted = db
    .select()
    .from(posts)
    .where(eq(posts.status, "deleted"))
    .orderBy(asc(posts.id))
    .limit(50)
    .all();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Untagged queue</h1>
        <p className="mb-4 text-sm text-zinc-500">
          Posts here have no tags and are hidden from the board. Open one and add tags to publish it.
        </p>
        {pending.length === 0 ? (
          <p className="text-zinc-500">Nothing waiting. ✓</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {pending.map((p) => (
              <Link key={p.id} href={`/posts/${p.id}`} className="group">
                <img
                  src={mediaUrl(p.thumbPath)}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  alt={`post ${p.id}`}
                  className="aspect-square w-full rounded object-cover opacity-60 ring-1 ring-yellow-700 transition-opacity group-hover:opacity-100"
                />
                <span className="text-xs text-zinc-500">#{p.id}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {deleted.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-400">Deleted</h2>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {deleted.map((p) => (
              <Link key={p.id} href={`/posts/${p.id}`} className="group">
                <img
                  src={mediaUrl(p.thumbPath)}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  alt={`post ${p.id}`}
                  className="aspect-square w-full rounded object-cover opacity-30 grayscale transition-opacity group-hover:opacity-70"
                />
                <span className="text-xs text-zinc-600">#{p.id}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
