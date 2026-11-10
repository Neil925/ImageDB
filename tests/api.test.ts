import { describe, it, expect, beforeAll } from "vitest";
import { fixtures } from "./fixtures";
import { createApiKey } from "@/lib/apikeys";
import { createPool, addPostToPool } from "@/lib/pools";

import { GET as getPosts } from "@/app/api/v1/posts/route";
import { GET as getPost } from "@/app/api/v1/posts/[id]/route";
import { GET as getTags } from "@/app/api/v1/tags/route";
import { GET as getPool } from "@/app/api/v1/pools/[id]/route";
import { GET as getOpenApi } from "@/app/api/v1/openapi.json/route";

let key: string;
let fx: Awaited<ReturnType<typeof fixtures>>;

function req(url: string, bearer?: string): Request {
  const headers: Record<string, string> = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request(url, { headers });
}

beforeAll(async () => {
  fx = await fixtures();
  key = (await createApiKey(fx.modId, "test")).key;
});

describe("public API v1 (plan §11)", () => {
  it("rejects missing and malformed keys with 401", async () => {
    expect((await getPosts(req("http://x/api/v1/posts"))).status).toBe(401);
    expect((await getPosts(req("http://x/api/v1/posts", "Bearer nope"))).status).toBe(401);
  });

  it("posts endpoint returns the documented shape", async () => {
    const res = await getPosts(req("http://x/api/v1/posts?tags=cat", key));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("v1");
    expect(body.count_capped).toBe(false);
    expect(body.posts.length).toBe(3);
    const p = body.posts[0];
    for (const field of ["id", "width", "height", "rating", "score", "tags", "thumb_url", "preview_url"]) {
      expect(p).toHaveProperty(field);
    }
    expect(["general", "sensitive", "questionable", "explicit"]).toContain(p.rating);
    expect(p.thumb_url).toMatch(/^\/media\/thumb\/[0-9a-f]{64}\.webp$/);
  });

  it("query errors surface as 400 with a message", async () => {
    const res = await getPosts(req("http://x/api/v1/posts?tags=rating:maybe", key));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown rating/);
  });

  it("post detail includes full tags, pools, source", async () => {
    const res = await getPost(req(`http://x/api/v1/posts/${fx.postIds[0]}`, key), {
      params: Promise.resolve({ id: String(fx.postIds[0]) }),
    });
    const body = await res.json();
    expect(body.post.tags.length).toBeGreaterThanOrEqual(2);
    expect(body.post.tags[0]).toHaveProperty("category");
    expect(body.post.source_url).toBe("https://example.invalid/src");
    expect(body.post.urls.original).toMatch(/originals\//);
  });

  it("pool endpoint returns ordered ids", async () => {
    const pool = await createPool("api-pool-test", null, fx.modId);
    await addPostToPool(pool!.id, fx.postIds[1]);
    await addPostToPool(pool!.id, fx.postIds[0]);
    const res = await getPool(req(`http://x/api/v1/pools/${pool!.id}`, key), {
      params: Promise.resolve({ id: String(pool!.id) }),
    });
    const body = await res.json();
    expect(body.pool.name).toBe("api-pool-test");
    expect(body.posts.map((p: { id: number }) => p.id)).toEqual([fx.postIds[1], fx.postIds[0]]);
    expect(body.posts[0].position).toBe(1);
  });

  it("tags autocomplete endpoint", async () => {
    const res = await getTags(req("http://x/api/v1/tags?query=c&limit=5", key));
    const body = await res.json();
    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags[0]).toHaveProperty("post_count");
  });

  it("openapi.json is machine-readable", async () => {
    const res = await getOpenApi();
    const spec = await res.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/api/v1/posts", "/api/v1/posts/{id}", "/api/v1/tags", "/api/v1/pools/{id}"]),
    );
  });

  it("rate limit: 60/min per key, 429 with Retry-After", async () => {
    const fresh = (await createApiKey(fx.modId, "burst")).key;
    let saw429 = false;
    let retryAfter: string | null = null;
    for (let i = 0; i < 70; i++) {
      const res = await getPosts(req("http://x/api/v1/posts?tags=night", fresh));
      if (res.status === 429) {
        saw429 = true;
        retryAfter = res.headers.get("Retry-After");
        break;
      }
    }
    expect(saw429).toBe(true);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
