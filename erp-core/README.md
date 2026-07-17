# Amal Foundation Platform — ERP Core

Core ERP backend (Hub Model, ADR-001/018). NestJS + TypeScript + PostgreSQL + Prisma + Redis/BullMQ + MinIO.
Governance: see `../07_GOVERNANCE/` — the ERP Implementation Constitution is mandatory.

## Status

**Phase 1 — Identity & Security: complete.**
**Phase 2 — Core Business Foundation: complete.**
**Phase 3 — Financial Core: complete.**
**Phase 4 — Donations & Campaigns: complete (ERP v1.0 MVP heart).**
**Phase 5A — Subscriptions & Baqiyat Al-Salihat: complete.**
**Phase 6 — Workflow Engine, Medical, Projects, Volunteers: complete.**
**Phase 7 — CMS & Communication Center: complete.**
**Phase 8 — Analytics & Executive Dashboard: complete.**
**Production hardening (security, monitoring, backups, CI): complete — see `../08_OPERATIONS/`.**

| Module | Contents |
|---|---|
| identity | Register, login (Argon2), JWT + refresh rotation, sessions/devices, user status management, **user ↔ Person linking** (`PATCH /users/:id/person`) |
| authorization | RBAC (`module.action` catalog), global guards, role/assignment APIs, ScopeRule storage |
| audit | Append-only audit (no mutation API), query endpoint |
| configuration | Settings (JSON) + feature flags, audited |
| **crm** | Unified Person registry: profiles, roles (multi-role), contacts, addresses, tags, relationships, **identity links** (external systems → one Person), **timeline**, **duplicate detection** (national id / contact / name with confidence scoring), **reversible merge workflow**, governorate **data scoping** (ADR-016), **sensitive-field masking** without `crm.view_sensitive` |
| **storage** | MinIO/S3 uploads (executable-blocked, size-capped), presigned download URLs, folders, **attachments to any entity**, version chains, archive-only (no delete), metadata in PostgreSQL / binaries in MinIO only |
| **notification** | Central engine: templates ({{placeholders}}), channels PUSH/EMAIL/SMS/IN_APP, **BullMQ delivery queue** (3 attempts, exponential backoff), delivery logs per attempt, provider abstraction (FCM-ready push; dev logger email/SMS until providers selected — OD-3), scheduled sends, per-user in-app feed (`GET /notifications/my`) |
| **donations** | Campaign lifecycle (guarded transitions, auto-created **dedicated RESTRICTED fund** per campaign — money structurally isolated), donations that **always resolve to a Person** (ADR-021: personId → identity link → verified contact → auto guest Person), COMPLETED donations post INCOME to the ledger (method-mapped asset account → donations revenue), refunds as REFUND transactions through finance approval, **recurring donations** (BullMQ repeatable job, idempotent generation, month-safe scheduling), campaign financials (raised/spent/balance/progress/donor count), donor stats, campaign updates, **public campaign APIs** (channel-filtered, donor-safe field whitelist), thank-you notification hook |
| **workflow** | Reusable config-driven engine (ADR-015): definitions + ordered steps (per-step `requiredPermission`, SLA hours, escalation permission), instances (one live per entity+definition), immutable action history (APPROVE/REJECT/RETURN/COMMENT), personal approval inbox (`my-tasks`), definition upsert API — no code changes to add flows |
| **medical** | Cases (FRS-006): patient = CRM Person (PATIENT role auto), committee review on the workflow engine (review → committee → final approval), guarded lifecycle, treatments (with cost → PENDING medical EXPENSE via finance tiers, MEDICAL restricted fund), funding summary from linked ledger transactions (required/raised/spent/available), governorate scoping on patients (ADR-016), provenance + idempotency |
| **projects** | Programs → projects → activities → tasks (FRS-007): guarded project & task lifecycles, participants (CRM Persons + timeline), attendance (participants only, upsert-idempotent), budget tracking from linked ledger expenses, **certificates** with unguessable verification codes + public QR verify endpoint, PROJECT scoping (scoped ids + own-managed) |
| **volunteers** | Profiles on CRM Persons (FRS-008): recruitment on the workflow engine (review → interview → approval; approval activates + assigns VOLUNTEER role), guarded status lifecycle, teams (DEPARTMENT scoping), hours with approval flow + approved-totals, structured evaluations (5 criteria, 1–5 validated) |
| **subscriptions** | Plans (categories incl. BAQIYAT/sponsorships, billing cycles MONTHLY…LIFETIME, grace periods, optional custom amounts, plan→fund targeting), subscriptions (Person-required, sponsorship beneficiary link, provenance+idempotency), **installment billing engine**: one-cycle-ahead generation, payment → INCOME ledger posting (revenue 4100), month-safe cycle math, payment reactivates LAPSED; hourly BullMQ housekeeping (grace-aware OVERDUE marking, 60-day lapse detection, **reminder ladder D-7/D-3/D0/O+7/O+30** with idempotent per-installment tags); waivers; **Baqiyat works** (khatma/sadaqa/feeding/majlis/projects) assignable to many subscriptions, execution recorded on each subscriber's timeline; dashboard summary |
| **cms** | Content engine (FRS-010): pages/news/articles with guarded lifecycle (draft → review → approve → publish, separation of duties via `cms.review`/`cms.publish`), **immutable revision history + restore**, scheduled publishing (BullMQ, every minute), SEO fields, categories, banners, popups, menus (nested), **featured campaigns** (validated via donations service), **public delivery APIs** (`public/content`, `public/banners`, `public/popups`, `public/menus/:key`, `public/featured-campaigns` — PUBLISHED only, channel-filtered, field whitelist), publish → push-notification hook |
| **communication** | Communication Center (FRS-009): **bulk campaigns** with audience targeting (ALL_USERS/ROLE/DONORS/VOLUNTEERS/SUBSCRIBERS), BullMQ fan-out through the central notification engine (every delivery = notification_record with logs), launch/cancel with audit, scheduled sends, **announcements** with date windows (+ public `communication/announcements/active`), dashboard (messages by status/channel, campaign counts) |
| **analytics** | KPI engine (FRS-013): executive overview (one screen — funds, donations, balance, entity counts), financial KPIs (today/month/year + growth), campaign top/weakest, subscription health + renewal rate, boxes (ledger-derived until the adapter ships), projects/medical/HR KPIs, monthly trend, **daily KPI snapshots** (BullMQ 00:15, upsert-idempotent) with history/as-of APIs, monthly/yearly/custom reports; read-only raw SQL over **reporting views** (migration 7, ADR-009) |
| **monitoring** | Ops diagnostics (Art. 9.3): queue health for all 6 queues, DB latency, process metrics, delivery failures; public `/health/live|ready` probes for orchestrators |
| **finance** | **Double-entry immutable ledger** (ADR-011): transactions + balanced ledger lines written once, corrections via compensating reversals; **IQD base currency with per-transaction FX** (ADR-019); chart of accounts, funds (GENERAL/RESTRICTED — restricted balances guarded), cost centers, budgets with consumption tracking; **amount-tiered approvals** (config table; separation of duties — creator ≠ approver); provenance + idempotency on every transaction; reports: fund balances, trial balance, income/expense by cost center; **receipts/vouchers** with sequential numbers + QR, rendered via PDFKit behind a `PdfRenderer` abstraction (ADR-020, Arabic TTF via `RECEIPT_FONT_PATH`), stored in MinIO |

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npx prisma migrate deploy        # applies prisma/migrations (or: migrate dev)
npm run prisma:seed              # permission catalog, system roles, bootstrap super admin
npm run start:dev                # http://localhost:3000/docs (Swagger)
```

If `migrate dev` reports drift against the hand-written init migration, reset and regenerate:
`npx prisma migrate dev --name init` (schema.prisma is the source of truth).

## Tests

```bash
npm test
```

Suites: permission guard, env validation, CRM masking, dedup confidence scoring,
scope filters, storage object keys/upload safety, template renderer.

## API surface (v1, all under /api/v1)

- `auth/*` — register, login, refresh, logout
- `users` — list, status, **person link**
- `authorization/*` — roles, permissions, assignments
- `audit/logs` — read-only trail
- `configuration/*` — settings, flags
- `crm/people` — CRUD(-delete), search/filter, `check-duplicates`, `:id/timeline`,
  `:id/contacts|addresses|roles|tags|relationships|identity-links`,
  `:id/merge`, `merges/:id/reverse`, `:id/archive|restore`
- `storage/*` — files (multipart upload), download-url, archive, folders, attachments
- `notifications/*` — send, history, `my`, `templates`

## Permission catalog

`identity.view|manage` · `authorization.view|manage` · `audit.view|export` ·
`configuration.view|manage` · `crm.view|manage|merge|export|view_sensitive` ·
`storage.view|manage` · `notification.view|manage|send` ·
`finance.view|create|approve|approve_executive|manage_structure|export` ·
`donations.view|manage|create|refund|export` ·
`subscriptions.view|manage_plans|create|collect|manage|export` ·
`workflow.view|manage` · `medical.view|manage|review|committee|approve|execute` ·
`projects.view|manage|manage_participants|manage_tasks|issue_certificates` ·
`volunteers.view|manage|review|approve|approve_hours` ·
`cms.view|manage|review|publish` · `communication.view|manage|send` ·
`analytics.view|manage|export` · `monitoring.view`

## Rules enforced by design (Constitution references)

- Person never hard-deleted; merge is reversible and fully audited (Art. 4.1, 4.4).
- Sensitive fields masked without explicit permission; scoping server-side (Art. 6.2, ADR-016).
- Binaries never in PostgreSQL; downloads via presigned URLs (Art. 3.5).
- No delivery work in the request lifecycle — BullMQ only (Art. 9.4, ADR-008).
- Every mutation audited; audit has no update/delete path (Art. 6.3).
- Provenance fields (`sourceSystem`, identity links) on channel-originated records (Art. 4.3).

## Finance API (added in Phase 3)

`finance/transactions` (create/list/get) · `:id/approve|reject|reverse|receipt` ·
`finance/accounts` · `finance/funds` · `finance/cost-centers` · `finance/approval-rules` ·
`finance/budgets` (+ `:id/close`) · `finance/reports/fund-balances|trial-balance|income-expense`

Seeded: base chart of accounts (cash/bank/gateway, revenue 4xxx, expense 5xxx),
GENERAL fund, 5 cost centers, approval tiers (EXPENSE ≥ 10,000,000 IQD → executive).

## Donations API (added in Phase 4)

`campaigns` (create/list/get/update) · `:id/transition` · `:id/updates` ·
`donations` (create/list/get) · `:id/complete` · `:id/refund` · `donors/:personId/stats` ·
`donations/recurring` (create/list) · `recurring/:id/status` ·
**public:** `public/campaigns?channel=app|website` · `public/campaigns/:id` (no auth, donor-safe)

## Subscriptions API (added in Phase 5A)

`subscriptions/plans` (list/create/update) · `subscriptions` (create/list/get/summary) ·
`:id/transition` · `installments/:id/pay` · `installments/:id/waive` ·
`baqiyat/works` (list/create) · `:id/assign` · `:id/status`

Seeded: BAQIYAT restricted fund, `subscription_reminder` template, subscriptions permissions.

## Phase 6 APIs

`workflow/definitions` (list/upsert) · `workflow/my-tasks` · `workflow/instances/:id` (+`/act`) ·
`medical/cases` (create/list/get) · `:id/submit|review|transition|treatments` ·
`projects` + `projects/programs` · `:id/transition|activities|tasks|participants` ·
`projects/activities/:id/attendance` · `projects/tasks/:id/transition` ·
`projects/certificates` (+ person list + **public** `verify/:code`) ·
`volunteers` (create/list/get) · `:id/submit|application|transition|hours|evaluations` ·
`volunteers/teams` (+ members) · `volunteers/hours/:id/decide`

Seeded: MEDICAL restricted fund; workflow definitions `medical_case_review` (3 steps)
and `volunteer_application` (3 steps); 19 new permissions.

## Phase 7 APIs

`cms/dashboard` · `cms/content` (create/list/get/update) · `:id/transition` ·
`:id/revisions` (+ `:version/restore`) · `cms/categories` · `cms/banners` ·
`cms/popups` · `cms/menus` (+ `:key`) · `cms/featured-campaigns` (+ delete) ·
**public:** `public/content?type=&channel=` · `public/content/:type/:slug` ·
`public/banners?placement=` · `public/popups?channel=` · `public/menus/:key` ·
`public/featured-campaigns` ·
`communication/dashboard` · `communication/campaigns` (create/list/get) ·
`:id/launch|cancel` · `communication/announcements` (create/list/update) ·
**public:** `communication/announcements/active`

Seeded: 6 content categories, 3 menus (main/side/footer), 7 new permissions.

## Phase 8 APIs

`analytics/dashboard` (full executive payload) · `analytics/overview` ·
`analytics/kpis/financial|campaigns|subscriptions|boxes|projects|medical|hr` ·
`analytics/trend/monthly` · `analytics/snapshots/:scope` (+ `snapshots/capture`) ·
`analytics/reports/monthly/:year/:month` · `reports/yearly/:year` · `reports/custom` ·
`monitoring` (+ `queues|database|delivery-failures`) · `health/live` · `health/ready`

Read models (migration 7): `v_daily_financials`, `v_campaign_performance`,
`v_subscription_health`, `v_monthly_income_expense`, `v_donor_activity` + `kpi_snapshots`.

## Production operations

`docker-compose.prod.yml` (internal-only datastores, healthchecks, log rotation) ·
`ops/backup/` (pg dump rotation + integrity check, MinIO mirror, **weekly restore
test asserting ledger balance**, `backup.env` parameterized pending OD-6) ·
`ops/crontab.example` · `.github/workflows/ci.yml` (lint/typecheck/test/build/
migrate/seed-idempotency + image build). Ops docs: `../08_OPERATIONS/`.

## Decision status (all v1.0 decisions closed — ADR register v1.2)

- **ADR-022** (OD-1): the ERP never processes payments — channels execute
  payments; the ERP records completed operations via the integration contracts.
- **ADR-023** (OD-3): no SMS/Email providers in v1.0; official channel is
  institutional **WhatsApp operated by staff**; the number is a configuration
  setting; all notifications recorded in-system; Business API deferred.
- **ADR-024** (OD-6): **RPO 1h / RTO 6h** — hourly WAL archiving + off-site
  copies on top of the dump rotation; restore drills are the evidence.
- **ADR-025** (OD-7): **Nginx + Let's Encrypt** in front of NestJS;
  PostgreSQL/Redis/MinIO never publicly exposed.
- **OD-8** (Supabase identity migration) is the only open decision; it gates
  Phase 5B mobile identity flows only — not v1.0.

## Next (operational, not engineering)

Nginx + certbot setup → `backup.env` off-site target + WAL archiving (RPO gate)
→ green CI run → staging deployment + checklist + timed restore drill (≤ 6h)
→ production go-live per `../08_OPERATIONS/`. Phase 5B (channel integration:
adapters, integration accounts, signed webhooks, Boxes read-model) proceeds
incrementally per ADR-017 after go-live.
