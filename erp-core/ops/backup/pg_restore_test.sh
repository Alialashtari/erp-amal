#!/usr/bin/env bash
# Amal ERP — scheduled restore test (Constitution Art. 9.2: backups must be
# restore-tested on a schedule; an untested backup is not a backup).
# Restores the newest daily dump into a throwaway database and verifies
# core invariants, then drops it.
#
# Cron: 0 4 * * 0   ops/backup/pg_restore_test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "${SCRIPT_DIR}/backup.env" ] && source "${SCRIPT_DIR}/backup.env"

COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/../../docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/archive}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${POSTGRES_USER:-amal}"
TEST_DB="amal_restore_test"

LATEST="$(ls -1t "${BACKUP_ROOT}/daily"/*.dump 2>/dev/null | head -1 || true)"
if [ -z "${LATEST}" ]; then
  echo "[restore-test] FAIL: no daily dumps found in ${BACKUP_ROOT}/daily" >&2
  exit 1
fi
echo "[restore-test] using ${LATEST}"

dc() { docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" "$@"; }

dc psql -U "${PG_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"
dc psql -U "${PG_USER}" -d postgres -c "CREATE DATABASE ${TEST_DB};"
dc pg_restore -U "${PG_USER}" -d "${TEST_DB}" --no-owner --exit-on-error /dev/stdin < "${LATEST}"

# Invariant checks: core tables restored and ledger is balanced (ADR-011).
CHECKS="
SELECT CASE WHEN COUNT(*) >= 0 THEN 'ok' END FROM users;
SELECT CASE WHEN COUNT(*) >= 0 THEN 'ok' END FROM people;
SELECT CASE WHEN COUNT(*) >= 0 THEN 'ok' END FROM financial_transactions;
SELECT CASE
  WHEN COALESCE(SUM(\"debitIqd\"), 0) = COALESCE(SUM(\"creditIqd\"), 0) THEN 'ok'
  ELSE 'LEDGER-UNBALANCED'
END FROM ledger_entries;
"
RESULT="$(dc psql -U "${PG_USER}" -d "${TEST_DB}" -tA -c "${CHECKS}")"
echo "[restore-test] checks: ${RESULT}"
if echo "${RESULT}" | grep -q 'LEDGER-UNBALANCED'; then
  echo "[restore-test] FAIL: restored ledger is not balanced" >&2
  exit 1
fi

dc psql -U "${PG_USER}" -d postgres -c "DROP DATABASE ${TEST_DB};"
echo "[restore-test] PASS: ${LATEST} restores cleanly"
