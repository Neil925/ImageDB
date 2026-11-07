#!/usr/bin/env bash
# Nightly ImageDB backup: consistent sqlite snapshot + full data dir via restic.
#
#   sudo apt install restic
#   restic init -r s3:s3.example.com/imagedb-backups   # or b2:/ repo
#
# crontab -e:
#   30 3 * * * /srv/imagedb/app/deploy/backup.sh >> /var/log/imagedb-backup.log 2>&1
set -euo pipefail

DATA_DIR="${IMAGEDB_DATA_DIR:-/srv/imagedb/data}"
SNAP_DIR="$DATA_DIR/snapshots"
RESTIC_REPO="${RESTIC_REPO:-}"   # e.g. s3:.../imagedb ; skip restic if unset

mkdir -p "$SNAP_DIR"

# 1) consistent sqlite snapshot (safe with WAL + running app)
sqlite3 "$DATA_DIR/imagedb.db" ".backup '$SNAP_DIR/imagedb-$(date +%F).db'"
find "$SNAP_DIR" -name 'imagedb-*.db' -mtime +7 -delete

# 2) versioned full backup of the whole data dir
if [ -n "$RESTIC_REPO" ]; then
  restic -r "$RESTIC_REPO" backup "$DATA_DIR" \
    --exclude "$DATA_DIR/snapshots" \
    --exclude "$DATA_DIR/*.db-wal" \
    --exclude "$DATA_DIR/*.db-shm" \
    --keep-daily 14 --keep-weekly 8 --keep-monthly 6
else
  echo "RESTIC_REPO not set - snapshot-only backup done ($SNAP_DIR)." >&2
fi

echo "backup ok $(date -Is)"
