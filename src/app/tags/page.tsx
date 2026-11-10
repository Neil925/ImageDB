import Link from "next/link";
import { listTags } from "@/lib/tags";
import { tagCategoryClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").toLowerCase().trim();
  const all = await listTags(2000);
  const tags = q ? all.filter((t) => t.name.includes(q)) : all;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Tags</h1>
      <form method="get" className="mb-4 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="filter…"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <button className="rounded bg-zinc-800 px-4 text-sm hover:bg-zinc-700">Filter</button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Link
            key={t.id}
            href={`/tags/${encodeURIComponent(t.name)}`}
            className={`rounded px-2 py-1 text-xs ${tagCategoryClass(t.category as never)}`}
          >
            {t.name} <span className="opacity-60">({t.postCount})</span>
          </Link>
        ))}
        {!tags.length && <p className="text-zinc-500">No tags.</p>}
      </div>
    </div>
  );
}
