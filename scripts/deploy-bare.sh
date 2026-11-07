#!/usr/bin/env bash
# Repeatable bare-metal (no Docker) ImageDB deploy - safe to re-run for updates.
#
#   scripts/deploy-bare.sh user@imagedb-vps
#
# Requirements on the VPS (see scripts/setup-bare-vps.sh): node >= 20, nginx,
# systemd unit /etc/systemd/system/imagedb.service, sudo for systemctl.
# Rollback = git checkout <prev-sha> && scripts/deploy-bare.sh <host>.
set -euo pipefail

HOST="${1:?usage: scripts/deploy-bare.sh user@host}"
APP_DIR="${APP_DIR:-/srv/imagedb/app}"
SERVICE="${SERVICE:-imagedb}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "working tree is dirty - commit first (or ALLOW_DIRTY=1)" >&2
  [ "${ALLOW_DIRTY:-0}" = "1" ] || exit 1
fi
SHA="$(git rev-parse --short HEAD)"
echo "==> deploying $SHA to $HOST (bare-metal)"

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .next --exclude data \
  ./ "$HOST:$APP_DIR/"

ssh "$HOST" "
  set -euo pipefail
  cd $APP_DIR
  npm ci --no-audit --no-fund
  npm run build
  # standalone server needs static assets + public beside it
  cp -r public .next/standalone/
  cp -r .next/static .next/standalone/.next/
  sudo systemctl restart $SERVICE
  sleep 2
  if curl -fsS localhost:3000/api/health >/dev/null; then
    echo '==> deploy OK: $SHA healthy'
  else
    echo '==> health check FAILED - check: journalctl -u $SERVICE -n 50' >&2
    exit 1
  fi
  systemctl is-active $SERVICE
"
