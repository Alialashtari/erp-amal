# Amal Foundation Platform — Monitoring Plan

**Version:** 1.0 · **Date:** 2026-07-17 · **Governance:** Constitution Art. 9.3

## 1. What the platform itself exposes (implemented)

Public, unauthenticated probes for orchestrators: `GET /health` (summary), `GET /health/live` (liveness), `GET /health/ready` (readiness — 503 when PostgreSQL is unreachable; wired as the Docker healthcheck in `docker-compose.prod.yml`). Permission-protected diagnostics (`monitoring.view`): `GET /monitoring` (full picture), `/monitoring/queues` (per-queue waiting/active/delayed/failed counts and paused state for all six platform queues), `/monitoring/database` (round-trip latency), `/monitoring/delivery-failures` (recent failed notification deliveries). Every request carries a correlation id (request-id middleware) and every sensitive operation is in the append-only audit trail (Art. 6.3), so incident forensics never depend on external tooling.

## 2. Host-level monitoring (operator duties)

The VPS operator watches: container health (`docker compose ps` — every service `healthy`), disk space on the Docker volumes and the backup archive (alert at 80%), memory/CPU, and certificate expiry on the TLS terminator. Container logs rotate automatically (json-file, 10 MB × 5) and should be shipped to the operator's log store; the API logs are structured enough to grep by request id.

## 3. Alert conditions (minimum set)

Page someone: `/health/ready` failing for > 2 minutes; any queue paused or `failed` count growing across two consecutive checks; database latency > 500 ms sustained (Art. 9.4 target breached); backup cron job exits non-zero; disk > 90%. Next business day: delivery-failures rising (usually a provider/OD-3 issue); repeated failed logins or security alerts from the identity module (Art. 6.4); dead-letter accumulation in any integration queue once channel integrations ship (Art. 8.3).

## 4. Alert delivery (ADR-023)

Per ADR-023 (closes OD-3), v1.0 uses **no SMS/Email providers**. The official communication channel is the Foundation's **institutional WhatsApp**, operated manually by staff; the WhatsApp number is a configuration setting, never hard-coded. Operationally: every alert condition is recorded in-system (notification records, `/monitoring`, audit) and surfaces to administration; the on-duty operator relays urgent alerts via institutional WhatsApp, and host-level cron failures use the host's `MAILTO`/notifier as a technical backstop. WhatsApp Business API automation is deferred to a post-v1.0 phase behind the existing provider abstraction (new ADR required).

## 5. Observability roadmap (post-v1.0, requires no ADR)

Prometheus scraping of a `/metrics` exporter, Grafana dashboards over the KPI snapshot history, and log aggregation are additive: they read the same endpoints and tables and change nothing in the modules. Anything heavier (APM, tracing infrastructure) follows the Constitution's amendment path if it introduces new platform services.
