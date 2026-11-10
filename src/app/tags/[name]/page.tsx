import Link from "next/link";
import { notFound } from "next/navigation";
import { findTagByName, aliasesFor, implicationsFor, autocompleteTags } from "@/lib/tags";
import { searchPosts } from "@/lib/search";
import { currentUser, hasRole } from "@/lib/authz";
import { tagCategoryClass } from "@/lib/format";
import { POSTS_PER_PAGE } from "@/lib/config";
import PostGrid from "@/components/PostGrid";
import { addAliasAction, addImplicationAction, setCategoryAction } from "@/app/actions/tags";

export const dynamic = "force-dynamic";

const btn = "rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700";
const inp = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw).toLowerCase();
  const tag = await findTagByName(name);
  if (!tag) notFound();

  const resolved = await (await import("@/lib/tags")).resolveTagName(name);
  const canonical = resolved && resolved.id !== tag.id;

  const [aliases, implies, result] = await Promise.all([
    aliasesFor(tag.id),
    implicationsFor(tag.id),
    searchPosts({ query: tag.name, limit: POSTS_PER_PAGE }),
  ]);
  const user = await currentUser().catch(() => null);
  const isMod = !!user && hasRole(user.role, "moderator");

  return (
    <div>
      <h1 className="text-xl font-semibold">
        <span className={tagCategoryClass(tag.category)}>{tag.name}</span>{" "}
        <span className="text-base font-normal text-zinc-500">({tag.postCount} posts)</span>
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        category: {tag.category} ·{" "}
        <Link href={`/tags/${tag.name}`} className="text-sky-400 hover:underline">
          canonical view
        </Link>
      </p>

      {aliases.length > 0 && (
        <p className="mt-2 text-sm text-zinc-400">
          Aliases: {aliases.map((a) => <span key={a} className="mr-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{a}</span>)}
        </p>
      )}
      {implies.length > 0 && (
        <p className="mt-1 text-sm text-zinc-400">
          Implies:{" "}
          {implies.map((i) => (
            <Link key={i.consequentId} href={`/tags/${i.name}`} className="mr-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700">
              {i.name}
            </Link>
          ))}
        </p>
      )}

      {isMod && (
        <div className="mt-4 grid gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-3 sm:grid-cols-3">
          <form action={addAliasAction} className="flex gap-2">
            <input type="hidden" name="tagName" value={tag.name} />
            <input name="alias" placeholder="new alias" className={inp} required />
            <button className={btn}>Add alias</button>
          </form>
          <form action={addImplicationAction} className="flex gap-2">
            <input type="hidden" name="antecedent" value={tag.name} />
            <input name="consequent" placeholder="implied tag" className={inp} required />
            <button className={btn}>Imply →</button>
          </form>
          <form action={setCategoryAction} className="flex gap-2">
            <input type="hidden" name="tagName" value={tag.name} />
            <select name="category" defaultValue={tag.category} className={inp}>
              {["general", "artist", "character", "copyright", "meta"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className={btn}>Set category</button>
          </form>
        </div>
      )}

      <div className="mt-6">
        <PostGrid rows={result.rows} nextHref={`/?tags=${encodeURIComponent(tag.name)}`} unresolved={[]} />
      </div>
    </div>
  );
}
