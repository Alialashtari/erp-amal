# Amal Foundation Platform — Operations Runbook

**Version:** 1.0 · **Date:** 2026-07-17 · **Scope:** ERP core on VPS (docker-compose.prod.yml)

## Daily (5 minutes)

Check `/monitoring` as an operator account: database `up` with latency < 100 ms; all six queues (`notifications`, `donations-recurring`, `subscriptions-billing`, `cms`, `communication`, `analytics`) unpaused with stable `failed` counts; glance at `delivery-failures`. Confirm last night's backup log line says integrity check passed and the off-site upload ran.

## Common incidents

**API down / `ready` failing.** `docker compose -f docker-compose.prod.yml ps` — if postgres is unhealthy, check disk first (full disks are the usual killer), then `docker compose logs postgres --tail 100`. If only the api container is unhealthy: `docker compose logs api --tail 200`, look for the env-validation message (misconfigured `.env` refuses boot by design) or migration errors; `docker compose restart api` after fixing the cause, never before.

**A queue's `failed` count is climbing.** Identify the queue in `/monitoring/queues`. For `notifications`, inspect `/monitoring/delivery-failures` — provider errors are expected until OD-3 lands real providers. For `subscriptions-billing` or `donations-recurring`, failures retry with backoff; investigate the api logs by job id. BullMQ keeps failed jobs; after fixing the root cause they can be retried from a maintenance script — never by editing data manually (Art. 3.6).

**A financial figure looks wrong.** Never edit the ledger (ADR-011 — immutable). Reconstruct from `finance/reports/trial-balance` and the transaction's ledger entries; corrections go through `:id/reverse` (compensating entry) with normal approvals. Every historical value is recoverable from the audit trail.

**Runaway disk usage.** Usual suspects in order: backup archive (rotation misconfigured — check `backup.env` retention), Docker logs (should be capped at 10 MB × 5 — verify), postgres volume growth (normal; plan capacity), MinIO growth (normal — receipts and documents are never deleted, Art. 4.4).

**Suspected account compromise.** Disable the user (`users` status endpoint), force logout of all their sessions, rotate their password, then read their full trail in `audit/logs` (every action carries IP + device). If an operator account was hit, rotate JWT secrets (Security Checklist §3).

## Maintenance procedures

**Deploy / rollback:** Deployment Guide §3. **Restore:** Backup & DR §4. **Adding an admin:** create the user, assign roles via `authorization` APIs — never seed manually in the database. **Changing a workflow (approval steps, SLAs):** `workflow/definitions` upsert API (ADR-015 — configuration, not code). **Changing approval thresholds:** `finance/approval-rules` API. All of these are audited automatically.

## Journal

Keep an operations journal (a simple append-only doc): every deploy (tag, time, operator), every incident (timeline, cause, fix), every restore drill (duration — this is the evidence behind RTO claims), every secret rotation. The journal is the operator's half of the audit trail.
