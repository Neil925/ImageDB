import { redirect } from "next/navigation";
import { currentUser, hasRole } from "@/lib/authz";
import { uploadAction } from "@/app/actions/upload";
import { RATINGS } from "@/db/schema";

export const dynamic = "force-dynamic";

const inp = "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
const btn = "rounded bg-sky-600 px-6 py-2 text-sm font-medium hover:bg-sky-500";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const user = await currentUser().catch(() => null);
  if (!user || !hasRole(user.role, "uploader")) redirect("/login");

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">Upload</h1>
      <p className="mb-4 text-sm text-zinc-500">
        {user.role === "viewer" ? "Your account can’t upload yet." : "jpeg · png · webp · avif · gif, ≤ 50 MB. SVG and look-alikes are refused by magic-byte sniffing."}
      </p>
      {sp.error && <p className="mb-4 rounded bg-red-950/70 px-3 py-2 text-sm text-red-300">{sp.error}</p>}
      <form action={uploadAction} className="space-y-4">
        <input type="file" name="file" accept="image/*" required className={inp} />
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Tags (space-separated)</label>
          <input name="tags" placeholder="blue_sky clouds -generated" className={inp} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Rating</label>
          <select name="rating" defaultValue="general" className={inp}>
            {RATINGS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Source URL (optional)</label>
          <input name="sourceUrl" className={inp} />
        </div>
        <button className={btn}>Upload</button>
      </form>
      <p className="mt-4 text-xs text-zinc-500">
        {user.role === "uploader"
          ? "Uploads enter the moderation queue; a moderator approves them."
          : "Your uploads are auto-approved once thumbnails and the near-dupe check finish."}
      </p>
    </div>
  );
}
