import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { apiKeys } from "@/db/schema";
import { API_RATE_LIMIT_PER_MIN } from "@/lib/config";

/**
 * API keys (plan §11): Authorization: Bearer idb_<hex>, scopes {read},
 * hashed at rest, shown once. Plan names argon2id; we use scrypt (stdlib,
 * no native build) — same properties, deviation noted in README.
 */

const KEY_BYTES = 24;

function scryptHash(secret: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function scryptVerify(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(secret, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

export async function createApiKey(userId: string, name: string): Promise<{ key: string; id: number }> {
  await dbReady();
  const hex = crypto.randomBytes(KEY_BYTES).toString("hex");
  const key = `idb_${hex}`;
  const rows = await db
    .insert(apiKeys)
    .values({ userId, name, keyHash: scryptHash(hex), keyPrefix: hex.slice(0, 8) })
    .returning({ id: apiKeys.id });
  return { key, id: rows[0].id };
}

export async function listApiKeys(userId?: string) {
  await dbReady();
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(userId ? eq(apiKeys.userId, userId) : undefined);
  return rows;
}

export async function revokeApiKey(id: number, userId?: string) {
  await dbReady();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), userId ? eq(apiKeys.userId, userId) : undefined));
  rateBuckets.delete(id);
}

/** Verify a bearer key. Returns the row on success. */
export async function verifyApiKey(rawKey: string) {
  await dbReady();
  if (!rawKey.startsWith("idb_")) return null;
  const hex = rawKey.slice(4);
  if (hex.length !== KEY_BYTES * 2) return null;
  const candidates = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, hex.slice(0, 8))))
    .limit(50);
  for (const row of candidates) {
    if (row.revokedAt) continue;
    if (scryptVerify(hex, row.keyHash)) {
      return row;
    }
  }
  return null;
}

// --- Rate limiting (plan §11): 60 req/min per key, 429 with Retry-After ---
// In-memory sliding window; a restart resets the window — acceptable at this scale.

const rateBuckets = new Map<number, number[]>();

export function checkRateLimit(keyId: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (rateBuckets.get(keyId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= API_RATE_LIMIT_PER_MIN) {
    rateBuckets.set(keyId, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + 60_000 - now) / 1000)) };
  }
  hits.push(now);
  rateBuckets.set(keyId, hits);
  return { ok: true };
}

export async function touchApiKey(id: number) {
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}
