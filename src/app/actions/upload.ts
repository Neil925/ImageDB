"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { handleUpload } from "@/lib/upload";
import { UnsupportedImageError } from "@/lib/images";
import { RATINGS, type Rating } from "@/db/schema";

export async function uploadAction(formData: FormData): Promise<void> {
  const user = await requireRole("uploader");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/upload?error=no+file");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const tags = String(formData.get("tags") ?? "").split(/\s+/).filter(Boolean);
  const ratingRaw = String(formData.get("rating") ?? "general");
  const rating: Rating = (RATINGS as readonly string[]).includes(ratingRaw)
    ? (ratingRaw as Rating)
    : "general";
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || undefined;

  try {
    const res = await handleUpload({ buf, uploaderId: user.id, tags, rating, sourceUrl });
    revalidatePath("/");
    if (res.duplicate) redirect(`/posts/${res.postId}?dupe=1`);
    redirect(`/posts/${res.postId}`);
  } catch (err) {
    const msg = err instanceof UnsupportedImageError ? err.message : "upload failed";
    redirect(`/upload?error=${encodeURIComponent(msg)}`);
  }
}
