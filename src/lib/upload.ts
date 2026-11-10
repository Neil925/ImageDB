import { eq } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { posts } from "@/db/schema";
import { RATING_VALUE, type Rating } from "@/db/schema";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { sha256Hex, sniffFormat, writeOriginal, UnsupportedImageError } from "@/lib/images";
import { applyTagsToPost } from "@/lib/tags";
import { publishMedia } from "@/lib/jobs";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function mimeToExt(mime: string): string {
  const ext = MIME_EXT[mime];
  if (!ext) throw new UnsupportedImageError(`unknown mime ${mime}`);
  return ext;
}

export interface UploadInput {
  buf: Buffer;
  uploaderId: string;
  tags: string[];
  rating?: Rating;
  sourceUrl?: string;
}

export interface UploadResult {
  postId: number;
  duplicate?: { postId: number; status: string };
}

/**
 * Upload path (plan §9): 50 MB cap → magic-byte sniff → sha256 → exact dedupe
 * → store original → pending post row → media job on the queue. Thumbnailing
 * never runs on the request path.
 */
export async function handleUpload(input: UploadInput): Promise<UploadResult> {
  await dbReady();
  const { buf, uploaderId, tags, rating = "general", sourceUrl } = input;
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new UnsupportedImageError(`file exceeds ${MAX_UPLOAD_BYTES} bytes`);
  }
  const format = sniffFormat(buf);
  if (!format) throw new UnsupportedImageError("refused: unknown file type (SVG and others rejected)");
  const mime = `image/${format}`;
  const ext = mimeToExt(mime);
  const hash = sha256Hex(buf);

  const dup = await db
    .select({ id: posts.id, status: posts.status })
    .from(posts)
    .where(eq(posts.sha256, hash))
    .limit(1);
  if (dup[0]) return { postId: dup[0].id, duplicate: { postId: dup[0].id, status: dup[0].status } };

  writeOriginal(hash, ext, buf);
  const inserted = await db
    .insert(posts)
    .values({
      sha256: hash,
      mime,
      bytes: buf.length,
      rating: RATING_VALUE[rating],
      uploaderId,
      status: "pending",
      sourceUrl: sourceUrl || null,
    })
    .returning({ id: posts.id });

  const postId = inserted[0].id;
  if (tags.length) await applyTagsToPost(postId, tags);
  await publishMedia(postId);
  return { postId };
}
