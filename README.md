# ImageDB

A private, self-hosted image board (booru) — Next.js 16, SQLite, sharp.
Think Gelbooru's core loop: posts + tags + search, minus accounts and public traffic.

## Features

- **Upload pipeline** — drag & drop, sha256 dedupe, sharp thumbnails
  (grid thumb + fitted large webp; GIFs keep the original for viewing)
- **Tag system** — paste Gelbooru-style tag lists or type-ahead with counts;
  aliases resolve to canonical tags; implications auto-apply; per-tag counts
- **Search** — `tag1 tag2`, `-excluded`, `wildcard*`, `rating:safe|nsfw|...`;
  keyset pagination (fast at depth)
- **Moderation-lite** — soft delete / unlist / restore; untagged upload queue
- **Safety** — G/S/Q/E ratings, noindex headers everywhere, private by default

## Development

```bash
npm install
npm run db:push   # create ./data/imagedb.db from schema (first time)
npm run seed      # 500 synthetic dev posts (~35 MB in ./data)
npm run dev       # http://localhost:3000
```

## Configuration

All runtime config is env vars (defaults fine for dev):

| Var | Default | Meaning |
|---|---|---|
| `IMAGEDB_DATA_DIR` | `./data` | db + media; **this folder is the whole board** |
| `IMAGEDB_MIGRATE` | unset | `1` = apply `./drizzle` SQL migrations at startup |
| `PORT` / `HOSTNAME` | 3000 / localhost | standalone server bind |

Tunables (code): `THUMB_WIDTH`, `LARGE_WIDTH`, `POSTS_PER_PAGE`, `MAX_UPLOAD_BYTES`
in `src/lib/config.ts` — keep `MAX_UPLOAD_BYTES` ≤ nginx `client_max_body_size`.

Data layout under `$IMAGEDB_DATA_DIR`:

```
imagedb.db            sqlite (WAL)
web/originals/xx/yy/<sha256>.<ext>   originals, content-addressed
web/thumbs/<sha256>.webp             grid thumbnails
web/large/<sha256>.webp              detail-page resizes
```

Because media is content-addressed, `/media/*` is served with immutable 1-year
cache headers by nginx (Docker *and* bare-metal), and never passes through Node.

---

# Deployment

Two supported shapes. Both: nginx + basic auth in front (app **and** media),
TLS on 443, nightly backups. Pick one; they share the same `deploy/` configs.

## A. Docker (recommended)

`docker-compose.yml` runs two containers: `app` (Next standalone, volume-backed
data, self-migrating) and `web` (nginx: basic auth + `/media/` from the volume).

**One-time VPS setup** (idempotent):

```bash
scripts/deploy.sh user@vps --dry  # not a flag; first run may fail on htpasswd:
ssh user@vps 'bash -s' < scripts/setup-vps.sh   # installs docker, creates htpasswd
```

Then from your workstation, as often as you like (initial install **and** updates):

```bash
scripts/deploy.sh user@vps
```

The script is repeatable: it rsyncs the repo, builds an image tagged with the
git SHA, `compose up -d`s, prunes dangling images, and fails loudly if
`/api/health` doesn't respond.

**Rollback:** `git checkout <previous-sha> && scripts/deploy.sh user@vps`.

**TLS:** put certs under `deploy/certs/<domain>/` and switch nginx to the
commented 443 block in `deploy/nginx-docker.conf`.

## B. Bare metal (systemd + nginx)

Uses `deploy/imagedb.service` + `deploy/nginx.conf.example`.

**One-time VPS setup** (idempotent; run on the VPS):

```bash
sudo bash scripts/setup-bare-vps.sh   # node LTS, nginx, sqlite3, unit, htpasswd, site
```

Edit `/etc/nginx/sites-available/imagedb` (server_name, certbot certs), then
`sudo certbot --nginx -d your.domain && sudo systemctl reload nginx`.

Then repeatable deploys from your workstation:

```bash
scripts/deploy-bare.sh user@vps
```

Same contract as the Docker path: rsync → `npm ci && npm run build` → copy
standalone static assets → `systemctl restart imagedb` → health check.
The systemd unit runs migrations on start (`IMAGEDB_MIGRATE=1`).

**Rollback:** `git checkout <previous-sha> && scripts/deploy-bare.sh user@vps`
(a rebuild — slower than the Docker image swap, still one command).

## Backups (both paths)

The entire board is one directory. `deploy/backup.sh` takes a consistent sqlite
snapshot (`sqlite3 .backup`, WAL-safe) and optionally versioned restic backups
(set `RESTIC_REPO=s3:...` / `b2:...`). Cron it:

```
30 3 * * * /srv/imagedb/app/deploy/backup.sh >> /var/log/imagedb-backup.log 2>&1
```

Test a restore once — `restic restore` or just copy the folder back.

## Security notes

- Basic auth covers every route including media; the app itself has **no auth**.
  Never expose port 3000 publicly (compose binds 127.0.0.1; the systemd unit
  assumes nginx fronts it).
- `X-Robots-Tag: noindex` is set at the nginx layer and in Next metadata.

## Repo map

```
src/app/            routes + pages (App Router)
src/components/     TagInput, UploadForm, PostGrid, PostActions
src/db/             drizzle schema + sqlite client (auto-migrate on env flag)
src/lib/            search, tags, images (sharp), media paths, config
drizzle/            generated SQL migrations
deploy/             nginx (docker+bare), systemd unit, backup script
scripts/            seed, deploy.sh (docker), deploy-bare.sh, setup-*.sh
```
