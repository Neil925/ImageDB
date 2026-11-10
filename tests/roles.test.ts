import { describe, it, expect, beforeAll } from "vitest";
import { hasRole } from "@/lib/authz";
import { verifyApiKey, checkRateLimit, createApiKey, revokeApiKey, listApiKeys } from "@/lib/apikeys";
import { fixtures } from "./fixtures";

let fx: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  fx = await fixtures();
});

/** Role capability matrix (plan §10) — enforcement helper. */
describe("role matrix (plan §10)", () => {
  const matrix: [string, "viewer" | "uploader" | "moderator" | "admin", boolean][] = [
    ["viewer", "viewer", true],
    ["viewer", "uploader", false],
    ["viewer", "moderator", false],
    ["viewer", "admin", false],
    ["uploader", "uploader", true],
    ["uploader", "moderator", false],
    ["moderator", "uploader", true],
    ["moderator", "moderator", true],
    ["moderator", "admin", false],
    ["admin", "admin", true],
    ["admin", "moderator", true],
    ["bogus", "viewer", true], // unknown role degrades to viewer
    ["bogus", "moderator", false],
  ];
  for (const [actual, min, want] of matrix) {
    it(`${actual} >= ${min} → ${want}`, () => {
      expect(hasRole(actual, min)).toBe(want);
    });
  }
});

describe("api keys", () => {
  it("created key verifies; tampered and revoked do not", async () => {
    const { key, id } = await createApiKey(fx.modId, "verify-test");
    expect(key).toMatch(/^idb_[0-9a-f]{48}$/);
    expect((await verifyApiKey(key))?.id).toBe(id);
    expect(await verifyApiKey("idb_" + "0".repeat(48))).toBeNull();
    await revokeApiKey(id, fx.modId);
    expect(await verifyApiKey(key)).toBeNull();
    const listed = await listApiKeys(fx.modId);
    expect(listed.find((k) => k.id === id)?.revokedAt).toBeTruthy();
  });

  it("sliding window: 61st hit inside the minute is refused", () => {
    const keyId = 999_001;
    for (let i = 0; i < 60; i++) expect(checkRateLimit(keyId).ok).toBe(true);
    const res = checkRateLimit(keyId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterSec).toBeGreaterThan(0);
  });
});
