# ImageDB — Build Progress

_Resumed-work notes. Last updated: 2026-11-07, paused by user during M0._

## Locked decisions
Personal private booru ("ImageDB"). Next.js App Router + SQLite (better-sqlite3/Drizzle) + sharp.
Local disk storage, Nginx serves `data/web` at `/media/` + basic auth in front of everything.
MVP = core booru (upload, tags+search, grid, ratings), no app accounts. VPS + domain deploy.
Tag workflow: paste Gelbooru-style tag lists + curated canonical tags via aliases.
Seed dev data only (no import of existing library).

## Done
- Scaffolded `/home/neil/Source/imagedb` (Next 16.4.5, TS, Tailwind v4, src dir). Renamed booru→imagedb.
- Deps: drizzle-orm, better-sqlite3, sharp, zod; dev: drizzle-kit, tsx, @types/better-sqlite3.
- `src/db/schema.ts` — posts (sha256 unique, rating, status active|pending|deleted, keyset index),
  tags (category, post_count), post_tags (composite PK + tag idx), tag_aliases, tag_implications.
- `src/db/index.ts` — WAL, FKs on, dev-hot-reload singleton.
- `src/lib/config.ts` — `IMAGEDB_DATA_DIR` (default `./data`), THUMB 300, LARGE 1200, PAGE 24, MAX_UPLOAD 32MB.
- `src/lib/media.ts` — content-addressed paths: `originals/ab/cd/<hash>.<ext>`, `thumbs/<hash>.webp`,
  `large/<hash>.webp`; URL `/media/<rel>`; traversal-guarded resolver.
- `src/lib/images.ts` — sha256 dedupe, sharp validation (jpeg/png/gif/webp/avif), thumb + large webp
  (GIFs keep original as large), atomic tmp+rename writes.
- `src/lib/tags.ts` — normalizeTag, alias resolution, getOrCreateTag, transitive implications (depth 5),
  applyTagsToPost (maintains post_count, flips pending→active), autocompleteTags, tagsForPost, aliases.
- `src/lib/search.ts` — token parser: AND by default, `-excl`, `wildcard*` (OR group, ≤32 tags),
  `rating:` shortcuts (safe/nsfw); EXISTS-based semantics; keyset `(created_at,id) DESC` pagination.
- `drizzle.config.ts` + scripts `db:push`, `seed`. Schema pushed → `data/imagedb.db` exists.
- `scripts/seed.ts` — 500 synthetic sharp-rendered posts, vocab/aliases/implications. One bug fixed
  (missing `.from(posts)`), **seed run not yet verified**.

## Not started / next steps (in order)
1. `npm run seed` → verify 500 posts, then git-commit M0.
2. UI/API (M1–M3): layout + globals.css, grid `/` (search + Next-cursor pagination),
   `/posts/[id]` (large view, tag sidebar, edit/delete, prev/next), `/tags`, `/tags/[name]`,
   `/uploads` (pending queue) + `/uploads/new` (drag-drop form), TagInput component
   (chips + typeahead + space-paste), API routes: POST `/api/uploads`,
   PUT `/api/posts/[id]/tags`, POST `/api/posts/[id]/delete|restore`, GET `/api/tags/autocomplete`,
   dev-only GET `/media/[...path]` route handler (prod: Nginx serves files directly).
3. `next.config.ts`: `experimental: { serverActions: { bodySizeLimit: "32mb" } }`.
4. `.gitignore`: add `data/` (db + generated media, not source).
5. M4 deploy artifacts: `deploy/nginx.conf.example` (basic auth + TLS + /media immutable alias),
   systemd unit, `deploy/backup.sh` (sqlite `.backup` + restic), README setup. Optional defense-in-depth
   HTTP basic auth middleware gated on `IMAGEDB_HTTP_USER/PASS` env.
6. Final: `npm run lint`, `npm run build`, curl-test pages, commit.

## Gotchas
- drizzle-kit push needs `data/` to exist (mkdir first) and `--force` when non-interactive.
- Route handlers don't parse multipart bodies — use `formData()` (fine, client posts multipart).
- Next 16: `searchParams`/`params` are Promises in server components; `output: "standalone"` for VPS.
- Grid must set width/height from DB (seeded images vary 400–2000px) to avoid layout shift.
- media route handler + Nginx must agree on layout relative to `data/web` (see src/lib/media.ts).
