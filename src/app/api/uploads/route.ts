import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, RATINGS, type Rating } from "@/db/schema";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { processImage, sha256Hex, UnsupportedImageError } from "@/lib/images";
import { applyTagsToPost } from "@/lib/tags";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file exceeds ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit` },
      { status: 413 },
    );
  }
  const ratingRaw = String(form.get("rating") ?? "");
  if (!(RATINGS as readonly string[]).includes(ratingRaw)) {
    return NextResponse.json({ error: `rating must be one of ${RATINGS.join(", ")}` }, { status: 400 });
  }
  const rating = ratingRaw as Rating;
  const tagString = String(form.get("tags") ?? "");
  const sourceUrl = String(form.get("source_url") ?? "").trim() || null;

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = sha256Hex(buf);
  const dup = db.select({ id: posts.id }).from(posts).where(eq(posts.sha256, hash)).get();
  if (dup) {
    return NextResponse.json({ error: "duplicate of an existing post", postId: dup.id }, { status: 409 });
  }

  try {
    const img = await processImage(buf);
    const row = db
      .insert(posts)
      .values({ ...img, rating, status: "pending", sourceUrl })
      .returning()
      .get();
    applyTagsToPost(row.id, tagString.split(/\s+/));
    return NextResponse.json({ postId: row.id, tagged: tagString.trim().length > 0 }, { status: 201 });
  } catch (err) {
    if (err instanceof UnsupportedImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
