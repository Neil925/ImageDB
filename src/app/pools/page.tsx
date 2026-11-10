import Link from "next/link";
import { listPools } from "@/lib/pools";
import { currentUser, hasRole } from "@/lib/authz";
import { createPoolAction } from "@/app/actions/pools";

export const dynamic = "force-dynamic";

const inp = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm";
const btn = "rounded bg-sky-600 px-4 py-1.5 text-sm font-medium hover:bg-sky-500";

export default async function PoolsPage() {
  const rows = (await listPools()) as {
    id: number;
    name: string;
    description: string | null;
    post_count: string | number;
  }[];
  const user = await currentUser().catch(() => null);
  const canCreate = !!user && hasRole(user.role, "uploader");

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Pools</h1>
      {canCreate && (
        <form action={createPoolAction} className="mb-6 flex flex-wrap gap-2">
          <input name="name" placeholder="pool name" className={inp} required />
          <input name="description" placeholder="description (optional)" className={`${inp} min-w-56 flex-1`} />
          <button className={btn}>Create pool</button>
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/pools/${p.id}`}
            className="block rounded border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-600"
          >
            <h2 className="font-semibold text-sky-400">{p.name}</h2>
            {p.description && <p className="mt-1 text-sm text-zinc-400">{p.description}</p>}
            <p className="mt-2 text-xs text-zinc-500">{Number(p.post_count)} posts</p>
          </Link>
        ))}
        {!rows.length && <p className="text-zinc-500">No pools yet.</p>}
      </div>
    </div>
  );
}
