import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, type PostStatus } from "@/db/schema";

const ACTIONS: Record<string, PostStatus> = {
  delete: "deleted",
  restore: "active",
  hide: "pending",
};

/** POST { action: "delete" | "restore" | "hide" } - soft status flips, files are kept. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const action = (body as { action?: string })?.action ?? "";
  const status = ACTIONS[action];
  if (!Number.isInteger(postId) || !status) {
    return NextResponse.json({ error: `action must be one of ${Object.keys(ACTIONS).join(", ")}` }, { status: 400 });
  }
  const updated = db
    .update(posts)
    .set({ status, updatedAt: Date.now() })
    .where(eq(posts.id, postId))
    .returning({ id: posts.id, status: posts.status })
    .get();
  if (!updated) return NextResponse.json({ error: "post not found" }, { status: 404 });
  return NextResponse.json(updated);
}
