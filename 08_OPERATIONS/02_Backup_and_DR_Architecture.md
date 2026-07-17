# Amal Foundation Platform — Backup & Disaster Recovery Architecture

**Version:** 1.1 · **Date:** 2026-07-17 · **Governance:** Constitution Art. 9.2, **ADR-024 (RPO 1h / RTO 6h — OD-6 closed)**

## 1. What must survive a disaster

Three data stores hold institutional truth: **PostgreSQL** (the ledger, Person registry, and every business record — the highest-value asset), **MinIO** (receipts, medical documents, media; the database stores only metadata per Art. 3.5), and **Redis** (queues/cache — *recoverable*, not backed up beyond AOF persistence; lost jobs are re-enqueued by reconciliation and repeatable schedules).

## 2. Backup design (implemented in `erp-core/ops/backup/`)

`pg_backup.sh` produces compressed custom-format dumps on a **daily / weekly / monthly** rotation, verifies each dump with `pg_restore --list` before rotation, and uploads to the off-site target. `minio_backup.sh` mirrors the object bucket locally and off-site. `pg_restore_test.sh` runs weekly, restoring the newest dump into a throwaway database and asserting core invariants — including that the restored double-entry ledger balances (ADR-011) — because an untested backup is not a backup (Art. 9.2). `ops/crontab.example` wires all three into cron.

## 3. Approved targets (ADR-024 — binding)

| Parameter | Approved value | How it is met |
|---|---|---|
| **RPO** | **1 hour** | Daily/weekly/monthly dump rotation **plus hourly WAL archiving**: enable `archive_command` (or pgBackRest) on the postgres container shipping WAL segments to the off-site target every ≤ 1h. Deployment configuration — no application code involved. |
| **RTO** | **6 hours** | Documented manual restore (§4): newest dump + WAL replay on the same or replacement VPS. Drill timings in the operations journal are the evidence; a warm standby is not required for v1.0. |
| Off-site location | Operator-recorded in `backup.env` (`OFFSITE_TARGET`) + operations journal | Mandatory before go-live (Art. 9.2); rclone remote or SSH path. |
| Retention | 14 daily / 8 weekly / 12 monthly | `backup.env` defaults, confirmed by ADR-024. |

**Go-live gate:** WAL archiving configured and verified (a forced WAL switch appears off-site within the hour), `OFFSITE_TARGET` set, and one timed restore drill ≤ 6h recorded.

## 4. Restore procedures

**Database:** stop the API (`docker compose -f docker-compose.prod.yml stop api`), restore the newest dump (`pg_restore -U $POSTGRES_USER -d amal_erp --clean --if-exists <dump>`), then **replay archived WAL** up to the latest segment (point-in-time recovery — this is what closes the gap from the last dump to within the 1-hour RPO), start the API, then run the post-deployment checklist. **Objects:** `mc mirror` the archive back into the bucket. **Full VPS loss:** provision a new VPS (Deployment Guide §2), pull dumps + object archive from the off-site target, restore both, repoint DNS. Every restore drill and every real restore is logged in the operations journal with timings, so RTO claims stay evidence-based.

## 5. Verification duties

Weekly: automated restore test passes (cron log). Monthly: one manual restore drill on staging from the off-site copy (not the local archive). Quarterly: full DR walkthrough of §4 including DNS. Backup failures raise alerts through the monitoring channel (Monitoring Plan §4) — a silent backup failure is treated as a production incident.
