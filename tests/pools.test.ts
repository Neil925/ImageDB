import { describe, it, expect, beforeAll } from "vitest";
import { createPool, addPostToPool, removePostFromPool, moveWithinPool, poolWithPosts, poolsForPost, reorderPool } from "@/lib/pools";
import { fixtures } from "./fixtures";

let fx: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  fx = await fixtures();
});

/** Acceptance: "pool ordering survives reorder". */
describe("pools (plan P4)", () => {
  it("ordered add, move, remove — positions stay 1..n and order survives", async () => {
    const [a, b, c, d] = fx.postIds;
    const pool = await createPool("reorder-test", null, fx.uploaderId);
    for (const p of [a, b, c]) await addPostToPool(pool!.id, p);

    let res = await poolWithPosts(pool!.id);
    expect(res!.posts.map((p: { postId: number }) => p.postId)).toEqual([a, b, c]);

    await moveWithinPool(pool!.id, c, "up");
    res = await poolWithPosts(pool!.id);
    expect(res!.posts.map((p: { postId: number }) => p.postId)).toEqual([a, c, b]);

    await addPostToPool(pool!.id, d);
    await moveWithinPool(pool!.id, d, "up");
    await moveWithinPool(pool!.id, d, "up");
    res = await poolWithPosts(pool!.id);
    expect(res!.posts.map((p: { postId: number }) => p.postId)).toEqual([a, d, c, b]);

    await removePostFromPool(pool!.id, c);
    res = await poolWithPosts(pool!.id);
    expect(res!.posts.map((p: { postId: number }) => p.postId)).toEqual([a, d, b]);
    expect(res!.posts.map((p: { position: number }) => p.position)).toEqual([1, 2, 3]);

    await reorderPool(pool!.id, [b, d, a]);
    res = await poolWithPosts(pool!.id);
    expect(res!.posts.map((p: { postId: number }) => p.postId)).toEqual([b, d, a]);
  });

  it("poolsForPost shows membership with position", async () => {
    const membership = await poolsForPost(fx.postIds[1]);
    const mine = membership.find((m) => m.name === "reorder-test");
    expect(mine?.position).toBe(1); // after reorder [b, d, a]
  });
});
