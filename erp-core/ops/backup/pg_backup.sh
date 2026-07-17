#!/usr/bin/env bash
# Amal ERP — PostgreSQL backup with daily/weekly/monthly rotation
# (Constitution Art. 9.2). Run from cron on the VPS host.
#
# RPO/RTO NOTE: retention counts and the off-site target are PARAMETERS.
# Final targets await OD-6 (backup RPO/RTO + DR location) — set them in
# ops/backup/backup.env once the OD-6 ADR is approved.
#
# Usage:   ./pg_backup.sh [daily|weekly|monthly]
# Cron:    15 2 * * *   ops/backup/pg_backup.sh daily
#          30 2 * * 0   ops/backup/pg_backup.sh weekly
#          45 2 1 * *   ops/backup/pg_backup.sh monthly
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "${SCRIPT_DIR}/backup.env" ] && source "${SCRIPT_DIR}/backup.env"

TIER="${1:-daily}"
COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/../../docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/archive}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${POSTGRES_USER:-amal}"
PG_DB="${POSTGRES_DB:-amal_erp}"

# Retention (override in backup.env after OD-6 fixes RPO/RTO):
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

# Off-site copy target (rclone remote or SSH path). Empty = local only (NOT
# production-acceptable; Art. 9.2 requires off-site copies — set after OD-6).
OFFSITE_TARGET="${OFFSITE_TARGET:-}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="${BACKUP_ROOT}/${TIER}"
FILE="${DIR}/${PG_DB}-${TIER}-${STAMP}.dump"
mkdir -p "${DIR}"

echo "[backup] ${TIER} dump of ${PG_DB} -> ${FILE}"
docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" \
  pg_dump -U "${PG_USER}" -d "${PG_DB}" --format=custom --compress=6 > "${FILE}"

# Integrity check: a dump that pg_restore cannot list is a failed backup.
docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" \
  pg_restore --list /dev/stdin < "${FILE}" > /dev/null
echo "[backup] integrity check passed ($(du -h "${FILE}" | cut -f1))"

# Rotation
case "${TIER}" in
  daily)   KEEP="${KEEP_DAILY}" ;;
  weekly)  KEEP="${KEEP_WEEKLY}" ;;
  monthly) KEEP="${KEEP_MONTHLY}" ;;
  *) echo "Unknown tier '${TIER}'" >&2; exit 1 ;;
esac
ls -1t "${DIR}"/*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f
echo "[backup] rotation done (keep ${KEEP} ${TIER})"

# Off-site copy (Art. 9.2)
if [ -n "${OFFSITE_TARGET}" ]; then
  if command -v rclone > /dev/null 2>&1 && [[ "${OFFSITE_TARGET}" == *:* ]]; then
    rclone copy "${FILE}" "${OFFSITE_TARGET}/${TIER}/"
  else
    scp "${FILE}" "${OFFSITE_TARGET}/${TIER}/"
  fi
  echo "[backup] off-site copy uploaded"
else
  echo "[backup] WARNING: OFFSITE_TARGET unset — local copy only (violates Art. 9.2 in production; resolve with OD-6)"
fi
