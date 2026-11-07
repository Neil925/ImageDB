#!/usr/bin/env bash
# One-time (idempotent) bare-metal VPS bootstrap - run ONCE, re-run safe.
#   run on the VPS: sudo bash scripts/setup-bare-vps.sh
# Installs node LTS, nginx, sqlite3 (for backups) and the systemd unit.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/imagedb/app}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
NODE_MAJOR="${NODE_MAJOR:-24}"

command -v node >/dev/null 2>&1 || {
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
}
dpkg -s nginx >/dev/null 2>&1 || apt-get install -y nginx
dpkg -s sqlite3 >/dev/null 2>&1 || apt-get install -y sqlite3

mkdir -p "$APP_DIR"

if [ ! -f /etc/systemd/system/imagedb.service ]; then
  cp "$REPO_DIR/deploy/imagedb.service" /etc/systemd/system/imagedb.service
  systemctl daemon-reload
  echo "installed imagedb.service"
fi

if [ ! -f /etc/imagedb/htpasswd ]; then
  mkdir -p /etc/imagedb
  USER_NAME="${HTPASSWD_USER:-admin}"
  if [ -t 0 ]; then read -rsp "password for $USER_NAME: " PASS; echo
  else PASS="${HTPASSWD_PASS:?set HTPASSWD_PASS}"; fi
  printf '%s:%s\n' "$USER_NAME" "$(openssl passwd -6 "$PASS")" > /etc/imagedb/htpasswd
  chmod 640 /etc/imagedb/htpasswd
  echo "created /etc/imagedb/htpasswd"
fi

if [ ! -f /etc/nginx/sites-enabled/imagedb ]; then
  cp "$REPO_DIR/deploy/nginx.conf.example" /etc/nginx/sites-available/imagedb
  ln -s /etc/nginx/sites-available/imagedb /etc/nginx/sites-enabled/imagedb
  echo "installed nginx site (edit server_name/certs for your domain)"
fi

echo "bare-metal VPS ready. From your workstation: scripts/deploy-bare.sh user@host"
