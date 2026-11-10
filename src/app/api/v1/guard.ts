import { checkRateLimit, touchApiKey, verifyApiKey } from "@/lib/apikeys";

type Handler = (ctx: { keyId: number }) => Promise<Response>;

/**
 * Public API auth (plan §11): Authorization: Bearer <key>, scopes read,
 * 60 req/min per key, 429 + Retry-After. Web-standard Response so the whole
 * API core is testable outside the Next runtime.
 */
export async function withApi(req: Request, handler: Handler): Promise<Response> {
  const authz = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(idb_[0-9a-f]+)$/i.exec(authz.trim());
  const key = m ? await verifyApiKey(m[1]) : null;
  if (!key) {
    return json({ error: "invalid api key" }, { status: 401 });
  }
  if (!key.scopes.includes("read")) {
    return json({ error: "missing scope: read" }, { status: 403 });
  }
  const rl = checkRateLimit(key.id);
  if (!rl.ok) {
    return json({ error: "rate limit exceeded", retry_after: rl.retryAfterSec }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }
  void touchApiKey(key.id);
  try {
    return await handler({ keyId: key.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal error";
    const status = /narrow your search|too many|max 8|at most|bad cursor|unknown|needs a number|only one|empty term|unbalanced|OR groups|bad id/.test(msg)
      ? 400
      : 500;
    return json({ error: msg }, { status });
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ version: "v1", ...(data as object) }), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
