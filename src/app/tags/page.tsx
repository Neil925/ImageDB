import Link from "next/link";
import { desc, like } from "drizzle-orm";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { tagCategoryClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tags — ImageDB" };

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rows = db
    .select()
    .from(tags)
    .where(q ? like(tags.name, `%${q.toLowerCase().replace(/\s+/g, "_")}%`) : undefined)
    .orderBy(desc(tags.postCount), tags.name)
    .limit(500)
    .all();

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Tags {q && `matching “${q}”`}</h1>
      <form method="get" className="mb-4 flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="filter by name…"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
        />
        <button className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700">Filter</button>
      </form>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <Link
              href={`/tags/${encodeURIComponent(t.name)}`}
              className={`truncate rounded px-2 py-1 text-sm ${tagCategoryClass(t.category)}`}
            >
              {t.name}
            </Link>
            <span className="shrink-0 text-xs text-zinc-500">{t.postCount}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
