import Link from "next/link";
import { redirect } from "next/navigation";
import { db, dbReady } from "@/db";
import { sql } from "drizzle-orm";
import { currentUser, hasRole } from "@/lib/authz";
import { MIME_EXT } from "@/lib/format";
import { mediaUrl, originalRelPath } from "@/lib/media";
import {
  approveAction,
  rejectAction,
  flagAction,
  bulkApproveAction,
} from "@/app/actions/moderation";
import { REJECT_REASONS } from "@/lib/moderation";
import { recentAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const btn = "rounded px-2 py-1 text-xs font-medium";

export default async function ModPage() {
  const user = await currentUser().catch(() => null);
  if (!user || !hasRole(user.role, "moderator")) redirect("/login");
  await dbReady();

  const queue = await db.execute(sql`
    select p.id, p.sha256, p.mime, p.status, p.created_at as "createdAt",
           coalesce(u.name, u.email, 'anon') as uploader,
           (select count(*) from post_tags pt where pt.post_id = p.id) as tag_count
    from posts p left join users u on u.id = p.uploader_id
    where p.status in ('pending','flagged')
    order by p.created_at asc
    limit 100`);
  const items = ((queue as unknown) as { rows?: Record<string, unknown>[] }).rows ?? [];

  const audit = await recentAudit(50);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Moderation queue</h1>
        <p className="mb-4 text-sm text-zinc-500">Oldest first. Approve / flag / reject per post; reject needs a reason.</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const id = Number(p.id);
            const sha = String(p.sha256);
            const ext = MIME_EXT[String(p.mime)] ?? "bin";
            return (
              <div key={id} className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- immutable cached webp */}
                <img
                  src={mediaUrl(originalRelPath(sha, ext))}
                  alt={`post ${id}`}
                  className="mx-auto max-h-44 w-auto rounded"
                  loading="lazy"
                />
                <p className="mt-2 text-sm">
                  <Link href={`/posts/${id}`} className="text-sky-400 hover:underline">
                    #{id}
                  </Link>{" "}
                  <span className={p.status === "flagged" ? "text-yellow-400" : "text-zinc-500"}>
                    {String(p.status)}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  {String(p.uploader)} · {Number(p.tag_count)} tags ·{" "}
                  {new Date(String(p.createdAt)).toISOString().slice(0, 16)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={bulkApproveAction}>
                    <input type="hidden" name="ids" value={id} />
                    <button className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`}>Approve</button>
                  </form>
                  <form action={flagAction}>
                    <input type="hidden" name="postId" value={id} />
                    <button className={`${btn} bg-yellow-700 text-white hover:bg-yellow-600`}>Flag</button>
                  </form>
                  <form action={rejectAction} className="flex items-center gap-1">
                    <input type="hidden" name="postId" value={id} />
                    <select name="reason" defaultValue="duplicate" className="rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs">
                      {REJECT_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <button className={`${btn} bg-red-800 text-white hover:bg-red-700`}>Reject</button>
                  </form>
                </div>
              </div>
            );
          })}
          {!items.length && <p className="text-zinc-500">Queue is empty.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Audit log (last 50)</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="pr-3">when</th>
              <th className="pr-3">actor</th>
              <th className="pr-3">action</th>
              <th className="pr-3">target</th>
              <th>meta</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} className="border-t border-zinc-800 align-top">
                <td className="py-1 pr-3 text-zinc-400">{a.createdAt?.toISOString().slice(0, 16)}</td>
                <td className="py-1 pr-3 text-zinc-400">{a.actorId ?? "system"}</td>
                <td className="py-1 pr-3">{a.action}</td>
                <td className="py-1 pr-3">
                  {a.targetType}
                  {a.targetId != null ? ` #${a.targetId}` : ""}
                </td>
                <td className="py-1 text-xs text-zinc-500">{JSON.stringify(a.meta ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
