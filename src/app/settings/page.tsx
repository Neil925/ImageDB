import { redirect } from "next/navigation";
import { db, dbReady } from "@/db";
import { users } from "@/db/schema";
import { currentUser, hasRole } from "@/lib/authz";
import { listApiKeys } from "@/lib/apikeys";
import { createKeyAction, revokeKeyAction, setUserRoleAction, changePasswordAction } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

const inp = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm";
const btn = "rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const sp = await searchParams;
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/login");
  await dbReady();

  const keys = await listApiKeys(user.id);
  const isAdmin = hasRole(user.role, "admin");
  const allUsers = isAdmin
    ? await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).limit(200)
    : [];

  return (
    <div className="max-w-3xl space-y-10">
      {sp.created && (
        <p className="rounded bg-sky-950/60 px-3 py-2 text-sm text-sky-300">
          New API key (shown once — copy it now):{" "}
          <code className="break-all font-mono text-emerald-300">{sp.created}</code>
        </p>
      )}

      <section>
        <h1 className="mb-1 text-xl font-semibold">API keys</h1>
        <p className="mb-3 text-sm text-zinc-500">
          Read-only JSON API: <code>Authorization: Bearer idb_…</code> — 60 req/min per key. Docs:{" "}
          <a href="/api/v1/openapi.json" className="text-sky-400 hover:underline">
            /api/v1/openapi.json
          </a>
        </p>
        <form action={createKeyAction} className="mb-4 flex gap-2">
          <input name="name" placeholder="key name (e.g. scraper)" className={inp} required />
          <button className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium hover:bg-sky-500">Create key</button>
        </form>
        <ul className="space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
              <span className="font-medium">{k.name}</span>
              <span className="font-mono text-xs text-zinc-500">idb_{k.keyPrefix}…</span>
              <span className="text-xs text-zinc-500">{k.scopes.join(",")}</span>
              <span className="ml-auto text-xs text-zinc-500">
                {k.lastUsedAt ? `last used ${k.lastUsedAt.toISOString().slice(0, 16)}` : "never used"}
              </span>
              {k.revokedAt ? (
                <span className="text-xs text-red-400">revoked</span>
              ) : (
                <form action={revokeKeyAction}>
                  <input type="hidden" name="keyId" value={k.id} />
                  <button className={`${btn} text-red-300`}>Revoke</button>
                </form>
              )}
            </li>
          ))}
          {!keys.length && <p className="text-sm text-zinc-500">No keys yet.</p>}
        </ul>
      </section>

      {isAdmin && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Users & roles</h2>
          <ul className="space-y-2">
            {allUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
                <span className="font-medium">{u.name || "—"}</span>
                <span className="text-zinc-500">{u.email}</span>
                <form action={setUserRoleAction} className="ml-auto flex gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" defaultValue={u.role} className={inp}>
                    {["viewer", "uploader", "moderator", "admin"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <button className={btn}>Set</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Change password</h2>
        <form action={changePasswordAction} className="flex flex-wrap gap-2">
          <input type="password" name="currentPassword" placeholder="current password" className={inp} required />
          <input type="password" name="newPassword" placeholder="new password (min 8)" className={inp} required minLength={8} />
          <button className={btn}>Change</button>
        </form>
      </section>
    </div>
  );
}
