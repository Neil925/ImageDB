/** Machine-readable contract (plan §11). Hand-authored, kept in sync with routes. */
const SPEC = {
  openapi: "3.1.0",
  info: { title: "ImageDB public API", version: "v1", description: "Read-only in v1; writes stay in the UI (server actions)." },
  components: {
    securitySchemes: {
      bearerKey: { type: "http", scheme: "bearer", description: "API key: idb_<hex>, scope read. 60 req/min per key." },
    },
    schemas: {
      PostSummary: {
        type: "object",
        properties: {
          id: { type: "integer" },
          width: { type: ["integer", "null"] },
          height: { type: ["integer", "null"] },
          rating: { type: "string", enum: ["general", "sensitive", "questionable", "explicit"] },
          score: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
          thumb_url: { type: "string" },
          grid_url: { type: "string" },
          preview_url: { type: "string" },
        },
      },
      Tag: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["general", "artist", "character", "copyright", "meta"] },
          post_count: { type: "integer" },
        },
      },
    },
  },
  security: [{ bearerKey: [] }],
  paths: {
    "/api/v1/posts": {
      get: {
        parameters: [
          { name: "tags", in: "query", description: "Booru query syntax (see docs).", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 40, maximum: 100 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Post list with capped count.",
            content: { "application/json": { schema: { type: "object", properties: { version: { const: "v1" }, count: { type: ["integer", "null"] }, count_capped: { type: "boolean" }, unresolved: { type: "array", items: { type: "string" } }, next_cursor: { type: ["string", "null"] }, posts: { type: "array", items: { $ref: "#/components/schemas/PostSummary" } } } } } },
          },
          "401": { description: "Invalid or missing API key." },
          "429": { description: "Rate limited; Retry-After header set." },
        },
      },
    },
    "/api/v1/posts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: { responses: { "200": { description: "One post with full tag list, pools, source." }, "404": { description: "Not found." } } },
    },
    "/api/v1/tags": {
      get: {
        parameters: [
          { name: "query", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { "200": { description: "Autocomplete: name, category, post_count." } },
      },
    },
    "/api/v1/pools/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: { responses: { "200": { description: "Ordered post ids." }, "404": { description: "Not found." } } },
    },
    "/api/v1/openapi.json": { get: { responses: { "200": { description: "This document." } } } },
  },
};

export async function GET() {
  return new Response(JSON.stringify(SPEC), {
    headers: { "content-type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
