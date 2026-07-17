# Amal Foundation Platform — Final System Architecture

**Version:** 1.0
**Status:** Approved
**Date:** 2026-07-16
**Governing ADRs:** ADR-001 … ADR-017

---

## 1. Architecture in one sentence

The Amal Foundation Platform is an **API-first modular monolith** (NestJS + PostgreSQL on VPS) acting as the foundation's **central management, governance, analytics, workflow, and integration hub**, with the existing Boxes system, Website backend, and Mobile backend remaining independent operational systems connected through versioned API contracts.

## 2. System landscape

```
┌───────────────┐  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐
│  Flutter App  │  │ Public Website│  │ Collector App  │  │ Future Clients │
│  (existing)   │  │  (existing)   │  │  (existing)    │  │                │
└───────┬───────┘  └───────┬───────┘  └───────┬────────┘  └───────┬────────┘
        │                  │                  │                   │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼────────┐          │
│ Mobile Backend│  │Website Backend│  │ Boxes System   │          │
│ (independent, │  │ (independent, │  │ (independent,  │          │
│  owns personal│  │  owns web ops)│  │  owns box ops) │          │
│  user data)   │  │               │  │                │          │
└───────┬───────┘  └───────┬───────┘  └───────┬────────┘          │
        │   institutional  │   institutional  │  sync             │
        │   transactions   │   transactions   │  (hybrid)         │
        ▼                  ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY  (/api/v1)                       │
│         AuthN · AuthZ · rate limiting · versioning · logging            │
├─────────────────────────────────────────────────────────────────────────┤
│                      AMAL CORE ERP  (NestJS Modular Monolith)           │
│                                                                         │
│  Integration Layer:  boxes-adapter · mobile-adapter · website-adapter   │
│                      payments-adapter · webhooks                        │
│  ────────────────────────────────────────────────────────────────────  │
│  Business Modules:   crm · finance · donations · subscriptions ·        │
│                      boxes(read-model) · medical · projects ·           │
│                      volunteers · communication · cms · documents       │
│  ────────────────────────────────────────────────────────────────────  │
│  Analytics Modules:  analytics · reporting · dashboard                  │
│  ────────────────────────────────────────────────────────────────────  │
│  Core Modules:       identity · authorization · audit · configuration · │
│                      workflow · notification · storage                  │
├────────────┬───────────────┬────────────────┬───────────────────────────┤
│ PostgreSQL │  Redis        │  BullMQ        │  MinIO (S3)               │
│ (central   │  (cache, rate │  (queues, sync │  (files, media,           │
│  DB)       │   limits)     │   jobs)        │   receipts, documents)    │
└────────────┴───────────────┴────────────────┴───────────────────────────┘
        ▲                                   ▲
┌───────┴────────────┐            ┌─────────┴──────────┐
│ Admin Dashboard    │            │ Executive Dashboard │
│ (Next.js, browser) │            │ (Next.js, browser)  │
└────────────────────┘            └────────────────────┘
External delivery services: FCM (push) · Email provider · SMS provider · Payment gateways
```

## 3. Component responsibilities

### 3.1 Core ERP backend (NestJS modular monolith)
Single deployable containing all modules. Strict boundaries: each module owns its entities, exposes internal service interfaces, and never touches another module's tables. Controllers are thin; business logic lives in services; every input validated at the API layer and the business layer.

**Core modules (Phase-0/1 layer)**
| Module | Responsibility | Key entities |
|---|---|---|
| identity | Registration, login, JWT + refresh rotation, sessions, devices, OTP/MFA-ready | User, Session, Token, Device, VerificationCode |
| authorization | RBAC + data scoping, permission matrix, delegation | Role, Permission, RolePermission, UserRole, ScopeRule |
| audit | Immutable activity/change/security logs (append-only) | AuditLog, SecurityLog |
| configuration | Settings, feature flags | Setting, FeatureFlag |
| workflow | Config-driven approval chains, SLA, escalation (ADR-015) | Workflow, WorkflowStep, Approval, Task |
| notification | Templates, channels (FCM/email/SMS/in-app), delivery logs | Notification, Template, Channel, DeliveryLog |
| storage | Upload/download, metadata, versioning over MinIO | File, Folder, Attachment |

**Business modules**
| Module | Responsibility | Master or read-model |
|---|---|---|
| crm | Unified Person registry, dedup/merge, roles, tags, timeline | **Master** |
| finance | Double-entry ledger, accounts, funds, cost centers, budgets, receipts | **Master** |
| donations | Campaigns, donations, recurring donations, receipts, campaign expenses | **Master** |
| subscriptions | Plans, subscriptions, installments, Baqiyat works, reminders | **Master** |
| boxes | Boxes/collectors/collections **read-model** + governance + financial posting | **Read-model** (Boxes system is master, ADR-002) |
| medical | Cases, committees, funding, treatment tracking, humanitarian aid | **Master** |
| projects | Programs → projects → activities → tasks, events, attendance, certificates | **Master** |
| volunteers | Volunteers, employees, teams, committees, hours, evaluations, training | **Master** |
| communication | Audiences, segmentation, message campaigns, automation triggers | **Master** |
| cms | Pages, news, articles, banners, media, publishing workflow | **Master** |
| documents | Digital archive, categories, versions, retention, linking | **Master** (files in MinIO) |

**Analytics modules** — analytics (KPI engine), reporting (PDF/Excel/CSV, scheduled reports), dashboard (executive cockpit APIs). Read-only consumers; own no business records. v1 implementation: reporting schema + PostgreSQL materialized views (no data warehouse).

**Integration layer** — one adapter per external system (anti-corruption layer): `boxes-adapter`, `mobile-adapter`, `website-adapter`, `payments-adapter`, plus a webhooks module. Adapters translate external contracts into internal service calls; the ERP core never sees external formats. Replacing an external system replaces only its adapter (ADR-005).

### 3.2 API Gateway
Single entry point for all external traffic (`/api/v1`). Responsibilities: authentication, authorization enforcement, rate limiting (tiers for anonymous / authenticated / administrative), request logging with request IDs, versioning, routing. No direct database or service access from outside. Implementation choice = OD-7.

### 3.3 Web dashboards (ADR-006)
Next.js applications served over HTTPS. The Admin Dashboard renders role-appropriate views (the "specialized dashboards" of the Master Dashboard Architecture become permission-filtered views, not separate apps). The Executive Dashboard is the leadership cockpit. Neither holds business logic; both consume versioned ERP APIs. Arabic-first, RTL, with i18n support.

### 3.4 External systems (independent, ADR-002/003/004)
- **Boxes system:** master of box operations; collector app offline mode remains its concern; ERP syncs and governs.
- **Website backend:** master of web-local operations; submits institutional transactions to ERP; renders ERP-published content.
- **Mobile backend:** master of mobile-local operations and **all Personal User Data** (ADR-013); submits institutional transactions to ERP.

## 4. API categories

Public (campaigns, news, projects, public statistics — no auth) · Protected (profile, own donations/subscriptions/requests — user JWT) · Administrative (staff operations — staff JWT + RBAC + scoping) · Integration (external system service accounts — scoped credentials + contract versioning) · Internal (module-to-module — in-process service interfaces, never HTTP).

Standards: REST, JSON, UTF-8, HTTPS-only, OpenAPI/Swagger auto-generated, consistent error envelope `{success, errorCode, message, details, timestamp, requestId}`, breaking changes only via new versions.

## 5. Cross-cutting concerns

- **Security:** JWT with refresh rotation; Argon2 password hashing; RBAC + data scoping (ADR-016); MFA-ready; rate limiting; secure uploads (type/size validation, no executables); secrets in environment/secret store; security headers; encryption of sensitive columns.
- **Audit:** append-only records for create/update/delete/approve/reject/export/login/permission-change/financial actions, storing user, action, module, old/new values, IP, device, timestamp. Partitioned tables with archival policy from day one.
- **Background processing (ADR-008):** all emails, notifications, report generation, exports, and sync jobs run in BullMQ; retries with backoff; dead-letter queues; job dashboards for ops.
- **Performance:** <500 ms target for normal API operations; heavy work queued; Redis caching for hot reads (dashboards, public campaign data).
- **Observability:** structured centralized logging, error tracking, performance and security monitoring (OpenTelemetry + Sentry recommended pending OD-class confirmation).

## 6. Deployment architecture (ADR-007)

```
VPS (Production)
├── docker-compose stack
│   ├── nginx / gateway  (TLS termination, rate limits)
│   ├── erp-api          (NestJS, N replicas)
│   ├── erp-worker       (BullMQ consumers)
│   ├── admin-web        (Next.js)
│   ├── postgres         (volume-backed; daily/weekly/monthly backups, off-site copy)
│   ├── redis
│   └── minio            (versioned buckets; backup lifecycle)
Environments: dev → test → staging → production (isolated, config via env)
CI/CD: git-based → lint → typecheck → test → build → migrate → deploy; rollback strategy required
```
Scale path: vertical first → read replicas / service extraction only via future ADR (ADR-010).

## 7. Implementation status

| Phase | Modules | Status |
|---|---|---|
| 0 — Foundation | scaffold, Docker, env, error envelope, versioned API, Swagger | ✅ complete |
| 1 — Identity & Security | identity, authorization (RBAC + ScopeRule), audit, configuration | ✅ complete |
| 2 — Core Business Foundation | crm (Person, dedup, reversible merge, timeline, scoping, masking), storage (MinIO, attachments, versions), notification (templates, BullMQ, provider abstraction) | ✅ complete |
| 3 — Financial Core | finance: double-entry immutable ledger (ADR-011), IQD base + per-tx FX (ADR-019), funds/accounts/cost centers, tiered approvals, budgets, PDFKit receipts + QR (ADR-020) | ✅ complete |
| 4 — Donations & Campaigns (MVP) | donations: campaigns with dedicated restricted funds, Person-guaranteed donations (ADR-021), ledger posting, refunds via finance approval, recurring engine (BullMQ), public campaign APIs | ✅ complete |
| 5A — Subscriptions & Baqiyat | plans/subscriptions/installments billing engine, reminder ladder, lapse detection, Baqiyat works, ledger posting | ✅ complete |
| 6 — Workflow + Programs & Services | reusable workflow engine (ADR-015), generalized scoping (ADR-016), medical cases + committee workflow, programs/projects/activities/tasks/attendance/certificates, volunteers + recruitment workflow + hours | ✅ complete |
| 5B — Channels & gateway | payment gateway (blocked on OD-1), mobile/website integration flows | next |
| 7 — Content & Communication | cms, communication center (OD-3 partially) | next |

Code: `erp-core/`. Notification channel providers are dev-logger implementations until OD-3 is decided; push is FCM-ready behind the provider token.

## 8. What this architecture explicitly does NOT include (v1)

Microservices · event bus (planned future, see Integration Architecture §8) · data warehouse · visual workflow designer · AI/ML/forecasting · blockchain · Elasticsearch · desktop ERP client · WhatsApp/Telegram channels · multi-tenancy. Each requires a future ADR.

---

*End of Final System Architecture v1.0*
