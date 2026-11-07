# ImageDB — Build Progress

_Completed 2026-11-07. All milestones M0–M4 built and verified. See README.md for usage/deployment._

## Status: MVP complete (M0–M4), pushed to github.com/Neil925/ImageDB

- **M0 skeleton**: Next 16.4.5 (App Router, TS, Tailwind v4) + Drizzle/better-sqlite3 + sharp.
  Schema (posts/tags/post_tags/tag_aliases/tag_implications) + SQL migrations in `drizzle/`.
  Seed: 500 synthetic posts. `npm run dev` grid verified.
- **M1 upload pipeline**: POST /api/uploads — sha256 dedupe (409 w/ pointer), sharp thumb/large webp,
  staging queue for untagged posts. Verified via curl incl. duplicate rejection.
- **M2 tags**: paste-mode + typeahead TagInput, aliases, transitive implications (verified:
  `generated` → `test_pattern` auto-applied), post_count maintenance, pending→active activation.
- **M3 browse**: grid w/ lazy thumbs + rating badges, search parser (`a b`, `-a`, `wildcard*`,
  `rating:safe|nsfw`), keyset pagination, post detail (prev/next, tag sidebar, edit tags,
  hide/delete/restore), /tags index, /tags/[name]. All verified 200 + behavior checks.
- **M4 deploy (both paths documented in README.md)**:
  - Docker: multi-stage Dockerfile (standalone + auto-migrate via IMAGEDB_MIGRATE=1),
    docker-compose.yml (app + nginx w/ basic auth + /media from volume), scripts/setup-vps.sh,
    scripts/deploy.sh (repeatable: rsync → SHA-tagged image → up -d → health → prune).
  - Bare metal: deploy/imagedb.service, deploy/nginx.conf.example, scripts/setup-bare-vps.sh,
    scripts/deploy-bare.sh (same repeatable contract).
  - Shared: /api/health endpoint, deploy/backup.sh (sqlite snapshot + optional restic).
  - Verified: standalone server boots fresh DB with auto-migration; lint 0 errors; prod build green.

## Dev notes
- `next dev` rewrites AGENTS.md (committed on purpose; see file header note).
- `cacheComponents`/`partialPrefetching` incompatible with force-dynamic routes — removed.
- Plain `<img>` everywhere (intentional): media is content-addressed + nginx-served with
  immutable caching; next/image adds nothing. The 5 lint warnings are accepted.
- Test post pair #503/#504 soft-deleted after API testing; seed data remains.

## Backlog (from plan)
favorites, pools, tag wiki, comments, per-user auth (better-auth) if friends join,
perceptual dedupe (imghash), tag category editing UI, bulk import CLI (if library ever appears),
hard-delete + file GC for deleted posts, rate limits if ever public.
