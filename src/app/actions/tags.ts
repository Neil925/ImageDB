"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { posts } from "@/db/schema";
import { currentUser, hasRole, requireRole } from "@/lib/authz";
import {
  replaceTagsOnPost,
  addImplication,
  setTagCategory,
  setAliases,
  aliasesFor,
  findTagByName,
} from "@/lib/tags";
import { audit } from "@/lib/audit";

/** Role matrix (plan §10): uploader tags own uploads; mod+ tags anything. */
export async function setPostTagsAction(formData: FormData) {
  const user = await requireRole("uploader");
  await dbReady();
  const postId = Number(formData.get("postId"));
  if (!Number.isInteger(postId)) throw new Error("bad postId");
  const rows = await db
    .select({ uploaderId: posts.uploaderId, status: posts.status })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  const post = rows[0];
  if (!post || post.status === "deleted") throw new Error("post not found");
  if (post.uploaderId !== user.id && !hasRole(user.role, "moderator")) {
    throw new Error("you can only tag your own uploads");
  }
  const tagsString = String(formData.get("tags") ?? "");
  await replaceTagsOnPost(postId, tagsString.split(/\s+/).filter(Boolean));
  await audit(user.id, "tags.set", "post", postId, { tags: tagsString.trim() });
  revalidatePath(`/posts/${postId}`);
}

export async function addAliasAction(formData: FormData) {
  const user = await requireRole("moderator");
  const tagName = String(formData.get("tagName") ?? "").toLowerCase();
  const alias = String(formData.get("alias") ?? "");
  const tag = await findTagByName(tagName);
  if (!tag) throw new Error("unknown tag");
  const existing = await aliasesFor(tag.id);
  await setAliases(tag.id, [...existing, alias]);
  await audit(user.id, "tags.alias-add", "tag", tag.id, { alias });
  revalidatePath(`/tags/${tag.name}`);
}

export async function addImplicationAction(formData: FormData) {
  const user = await requireRole("moderator");
  const antecedent = String(formData.get("antecedent") ?? "");
  const consequent = String(formData.get("consequent") ?? "");
  const res = await addImplication(antecedent, consequent);
  await audit(user.id, "tags.implication-add", "tag", res.antecedent.id, {
    consequent: res.consequent.name,
  });
  revalidatePath(`/tags/${res.antecedent.name}`);
}

export async function setCategoryAction(formData: FormData) {
  const user = await requireRole("moderator");
  const tagName = String(formData.get("tagName") ?? "").toLowerCase();
  const category = String(formData.get("category") ?? "general");
  const tag = await findTagByName(tagName);
  if (!tag) throw new Error("unknown tag");
  const cats = ["general", "artist", "character", "copyright", "meta"] as const;
  if (!(cats as readonly string[]).includes(category)) throw new Error("bad category");
  await setTagCategory(tag.id, category as (typeof cats)[number]);
  await audit(user.id, "tags.category-set", "tag", tag.id, { category });
  revalidatePath(`/tags/${tag.name}`);
}
