# Amal Foundation Platform — Operational Readiness Review (ERP v1.0)

**Version:** 1.0 · **Date:** 2026-07-17 · **Purpose:** go/no-go evidence for production, mapped to Constitution Art. 9–10 and the open-decisions register (Art. 12).

## 1. Build completeness

| Phase | Scope | Status |
|---|---|---|
| Foundation + 1 | Identity, authorization, audit, configuration | ✅ complete |
| 2 | CRM, storage, notification engine | ✅ complete |
| 3 | Financial core (immutable double-entry ledger) | ✅ complete |
| 4 | Donations & campaigns | ✅ complete |
| 5A | Subscriptions & Baqiyat Al-Salihat | ✅ complete |
| 6 | Workflow engine, medical, projects, volunteers | ✅ complete |
| 7 | CMS & Communication Center | ✅ complete |
| 8 | Analytics & executive dashboard (KPI engine, snapshots, reports) | ✅ complete |
| 5B | Channel/payment-gateway integration | ⛔ blocked by **OD-1** (and OD-8) — no payment or gateway code may be written before the ADR (stakeholder ruling) |
| — | Boxes read-model + adapter | deferred with integrations (ADR-002/017/018); boxes KPIs meanwhile derive from the ledger |

## 2. Production hardening delivered

Application: CORS allowlist enforced at boot, graceful shutdown, trust-proxy, Swagger off in production, hardened env validation (refuses default secrets, missing infra vars, wildcard CORS). Infrastructure: `docker-compose.prod.yml` (internal-only datastores, healthchecks everywhere, restart policies, log rotation, Redis auth + AOF). Monitoring: `/health/live|ready` probes + permission-protected `/monitoring/*` (queues, DB latency, process metrics, delivery failures). Backups: rotation + integrity-checked dumps, MinIO mirror, **automated weekly restore test that asserts the restored ledger balances**, cron templates. CI: lint/typecheck/tests/build/migration/seed-idempotency pipeline + production image build.

## 3. Go-live blockers — ALL DECISION BLOCKERS RESOLVED (2026-07-17)

Every previously open go-live decision is now closed by ADR: **OD-1 → ADR-022** (payments are external; the ERP records, never processes), **OD-3 → ADR-023** (no SMS/Email providers in v1.0; institutional WhatsApp operated manually; number is configuration; Business API deferred), **OD-6 → ADR-024** (RPO 1h / RTO 6h; hourly WAL archiving + off-site copies), **OD-7 → ADR-025** (Nginx + Let's Encrypt; datastores never public). The only open decision anywhere is **OD-8** (Supabase identity migration), which gates Phase 5B mobile identity flows only and does not block v1.0.

What remains before production is **operator setup, not decisions**: configure Nginx + certbot (Deployment Guide §1), set `OFFSITE_TARGET` + enable WAL archiving and verify the RPO gate (Backup & DR §3), store the WhatsApp number as configuration (ADR-023), then run the pipeline: green CI → staging deployment + post-deployment checklist + one timed restore drill ≤ 6h → production.

## 4. Quality-gate status (Art. 10)

Architecture compliance: module boundaries, owner-module writes, provenance, immutability rules honored in Phases 7–8 (analytics is read-only by design; raw-SQL reporting per ADR-009). Tests: suites exist for every phase including content lifecycle and KPI rules; the full suite passed at the Phase-7 gate; Phases 8 + hardening await the next CI run for their formal gate. Documentation: README, this operations set, and OpenAPI (auto-generated) updated. Security review: checklist document 04, all application items verified in code. Deployable artifact: production compose + CI image. Remaining for the formal v1.0 stamp: one green CI run over the final tree, staging deployment following the Deployment Guide, and the three ADRs above.
