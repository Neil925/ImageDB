import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { applyTagsToPost } from "@/lib/tags";

/** PUT { tags: "space separated tag string" } - additive; removal not in MVP. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId < 1) {
    return NextResponse.json({ error: "invalid post id" }, { status: 400 });
  }
  const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get();
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const tagString = typeof (body as { tags?: unknown })?.tags === "string" ? (body as { tags: string }).tags : "";
  const result = applyTagsToPost(postId, tagString.split(/\s+/));
  return NextResponse.json(result);
}
