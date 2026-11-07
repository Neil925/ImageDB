import fs from "fs";
import { resolveWebPath } from "@/lib/media";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/**
 * Dev-mode media serving. In production Nginx serves data/web directly at /media/
 * (see deploy/nginx.conf.example) and this handler never runs for media requests;
 * it stays as a fallback for `next start` without Nginx.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const abs = resolveWebPath(parts.join("/"));
  if (!abs || !fs.existsSync(abs)) {
    return new Response("media not found", { status: 404 });
  }
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  const buf = fs.readFileSync(abs);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      // all media paths are content-addressed -> safe to cache forever
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
