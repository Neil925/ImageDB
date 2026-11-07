#!/usr/bin/env bash
# One-time (idempotent) VPS bootstrap - run ONCE per server, re-run safe.
#
#   scripts/setup-vps.sh   (executed on the VPS itself, after first rsync)
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/imagedb/app}"

command -v docker >/dev/null 2>&1 || {
  echo "installing docker..."
  curl -fsSL https://get.docker.com | sh
}
docker compose version >/dev/null || { echo "docker compose plugin missing" >&2; exit 1; }

mkdir -p "$APP_DIR" "$APP_DIR/deploy/certs"

if [ ! -f "$APP_DIR/deploy/htpasswd" ]; then
  USER_NAME="${HTPASSWD_USER:-admin}"
  if [ -t 0 ]; then
    read -rsp "password for $USER_NAME: " PASS; echo
  else
    PASS="${HTPASSWD_PASS:?set HTPASSWD_PASS for non-interactive runs}"; echo
  fi
  printf '%s:%s\n' "$USER_NAME" "$(openssl passwd -6 "$PASS")" > "$APP_DIR/deploy/htpasswd"
  chmod 640 "$APP_DIR/deploy/htpasswd"
  echo "created $APP_DIR/deploy/htpasswd"
fi

echo "VPS ready. Use scripts/deploy.sh from your workstation."
