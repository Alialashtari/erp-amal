#!/usr/bin/env bash
# Amal ERP — MinIO (object storage) backup (Constitution Art. 9.2).
# Files (receipts, documents, media) live only in MinIO (Art. 3.5), so the
# object store is backed up alongside PostgreSQL.
#
# Mirrors the bucket to a local archive and optionally to an off-site rclone
# remote. Retention/off-site targets are parameters pending OD-6.
#
# Cron: 0 3 * * *   ops/backup/minio_backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "${SCRIPT_DIR}/backup.env" ] && source "${SCRIPT_DIR}/backup.env"

COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/../../docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/archive}"
BUCKET="${S3_BUCKET:-amal-erp}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"

DEST="${BACKUP_ROOT}/minio/${BUCKET}"
mkdir -p "${DEST}"

# Requires the MinIO client (mc) on the host with an alias configured:
#   mc alias set amal http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
if ! command -v mc > /dev/null 2>&1; then
  echo "[minio-backup] FAIL: MinIO client (mc) not installed on host" >&2
  exit 1
fi

echo "[minio-backup] mirroring ${BUCKET} -> ${DEST}"
mc mirror --overwrite --preserve "amal/${BUCKET}" "${DEST}"

if [ -n "${OFFSITE_TARGET}" ] && command -v rclone > /dev/null 2>&1; then
  rclone sync "${DEST}" "${OFFSITE_TARGET}/minio/${BUCKET}"
  echo "[minio-backup] off-site sync complete"
else
  echo "[minio-backup] WARNING: no off-site sync configured (resolve with OD-6)"
fi
echo "[minio-backup] done"
