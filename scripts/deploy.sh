#!/usr/bin/env bash
# Repeatable ImageDB deploy - safe to run any number of times (also for updates).
#
#   scripts/deploy.sh user@imagedb-vps
#
# Flow: rsync repo -> build tagged image -> compose up -d -> health check -> prune.
# The current git SHA tags each image, so a deploy is auditable and rollback is
# just: git checkout <prev-sha> && scripts/deploy.sh <host>.
set -euo pipefail

HOST="${1:?usage: scripts/deploy.sh user@host}"
APP_DIR="${APP_DIR:-/srv/imagedb/app}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "working tree is dirty - commit first (or ALLOW_DIRTY=1)" >&2
  [ "${ALLOW_DIRTY:-0}" = "1" ] || exit 1
fi
SHA="$(git rev-parse --short HEAD)"
echo "==> deploying $SHA to $HOST"

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .next --exclude data \
  --exclude deploy/htpasswd --exclude deploy/certs \
  ./ "$HOST:$APP_DIR/"

# GIT_SHA env keeps compose project images versioned; prune only dangling ones.
ssh "$HOST" "
  set -euo pipefail
  cd $APP_DIR
  [ -f deploy/htpasswd ] || { echo 'missing deploy/htpasswd - run scripts/setup-vps.sh first' >&2; exit 1; }
  GIT_SHA=$SHA docker compose build
  GIT_SHA=$SHA docker compose up -d
  docker image prune -f >/dev/null
  sleep 2
  if curl -fsS localhost:3000/api/health >/dev/null; then
    echo '==> deploy OK: $SHA healthy'
  else
    echo '==> health check FAILED - previous container stays if compose failed; check: docker compose logs app' >&2
    exit 1
  fi
  docker compose ps
"
