# Amal Foundation Platform — Architecture Decision Records (ADR)

**Version:** 1.0
**Status:** Approved
**Date:** 2026-07-16
**Authority:** These ADRs supersede any conflicting statement in documents 00–06. See ADR-012 for the document precedence rule.

---

## ADR-001 — The ERP follows the Hub Model

**Status:** Accepted (explicit stakeholder decision)

**Context.** The documentation corpus contains two incompatible philosophies: (A) the ERP as the sole operational backend that absorbs all systems ("all business operations must originate from ERP"), and (B) the ERP as a central management, governance, analytics, workflow, and integration platform over independent operational systems (Integration & External Systems Strategy v1).

**Decision.** The ERP follows **Model B — the Hub Model**. The ERP is the central management, analytics, governance, workflow, and integration platform. It is **not** the primary operational backend for systems that already exist.

**Consequences.**
- The ERP aggregates, normalizes, analyzes, monitors, and governs; it does not require ownership of every operational system.
- Data ownership is split between ERP-mastered domains and externally-mastered domains (see Final Data Ownership Model).
- The ERP database contains synchronized replicas of external operational data, marked with provenance metadata.
- All statements in older documents implying "the ERP owns everything" are void where they conflict with this ADR.

---

## ADR-002 — Existing Boxes Dashboard remains operational, integrated via APIs

**Status:** Accepted (explicit stakeholder decision)

**Context.** FRS-005 and the Boxes & Collections module spec describe a fully rebuilt Boxes module inside the ERP. The Integration Strategy and Deployment documents state the existing Boxes Dashboard remains independent.

**Decision.** The existing Boxes Dashboard **remains operational and independent**. The ERP integrates with it through APIs only. The ERP's internal Boxes module is a **synchronized read-model plus governance layer** (reporting, analytics, financial posting), not the operational system.

**Consequences.**
- The Boxes system remains the master of: boxes, collectors, collection operations, routes, field visits.
- The ERP consumes this data via the integration layer and posts approved collections into the Finance ledger.
- FRS-005 and the Boxes module spec are reinterpreted as the *target feature set of the integration read-model and reporting*, not as a rebuild mandate.
- If the Boxes system is ever rebuilt (allowed by ADR-005), only the integration adapter changes; the ERP core does not.

---

## ADR-003 — Existing Website Backend remains operational, integrated via APIs

**Status:** Accepted (explicit stakeholder decision)

**Decision.** The existing Website Backend remains an independent system connected through APIs. The website consumes ERP-published data (campaigns, CMS content, statistics) and submits institutional transactions (donations, subscriptions, requests, registrations) to the ERP through the integration layer.

**Consequences.**
- The ERP is technology-agnostic toward the website (Laravel, Node, Django, or any future stack).
- The ERP depends only on API contracts, never on website internals.
- Website-local concerns (sessions, rendering, SEO mechanics) are owned by the website. Institutional records submitted by the website are mastered in the ERP once accepted.

---

## ADR-004 — Existing Mobile Backend remains operational, integrated via APIs

**Status:** Accepted (explicit stakeholder decision)

**Decision.** The existing Mobile Backend (currently Supabase-based) remains an independent operational system connected through APIs. The Flutter application is not rebuilt.

**Consequences.**
- The mobile backend continues to own mobile-operational data, including **Personal User Data** (Quran notes, bookmarks, khatmas, tasbih, reading progress, preferences). This data never enters ERP reports and is never visible to administrators.
- Institutional transactions initiated from mobile (donations, subscriptions, medical requests, event registrations, box requests) flow to the ERP through the integration layer and are mastered in the ERP once accepted.
- Identity unification (one Person across mobile/website/ERP) is achieved through the identity integration contract, not by absorbing the mobile backend.

---

## ADR-005 — External systems are replaceable; replacement is not required now

**Status:** Accepted (explicit stakeholder decision)

**Decision.** Any connected system (Boxes, Website Backend, Mobile Backend) may be replaced in the future. Replacement must never require changes to the ERP core — only to the relevant integration adapter.

**Consequences.**
- Integration adapters are isolated per external system behind stable internal interfaces (anti-corruption layer).
- API contracts are versioned; contract tests protect the ERP from external changes.
- Principle: **Replace systems, not the ERP core.**

---

## ADR-006 — Web-based Admin Dashboard

**Status:** Accepted (explicit stakeholder decision)

**Context.** Deployment & Infrastructure Architecture v1 described a locally installed desktop ERP dashboard (macOS/Windows). This conflicts with the approved stack (Next.js web dashboard).

**Decision.** The Admin Dashboard and Executive Dashboard are **web applications (Next.js + React + TypeScript)** accessed through a browser. The "local desktop installation" model in Deployment & Infrastructure Architecture v1 is **superseded**.

**Consequences.**
- All functional requirements of that document (24/7 backend, dashboard as console, no operational dependency on the dashboard being open) are satisfied by the web deployment.
- No desktop packaging, no sync-on-launch client engine. The browser client always reads live APIs.

---

## ADR-007 — Backend and Database hosted on VPS

**Status:** Accepted (explicit stakeholder decision)

**Context.** Older documents advised staying on Supabase and deferring VPS. The approved direction mandates VPS hosting.

**Decision.** The ERP backend (NestJS), PostgreSQL, Redis, and MinIO run on VPS infrastructure, containerized with Docker (Docker Compose initially). Supabase remains only as the legacy mobile backend until/unless replaced (ADR-004/005).

**Consequences.**
- Environments: Development → Testing → Staging → Production, isolated.
- The platform is cloud-agnostic: no dependency on any single hosting provider.
- Backup, monitoring, and DR responsibilities move to the platform team (see Constitution §9).

---

## ADR-008 — Redis and BullMQ are part of the approved stack

**Status:** Accepted (explicit stakeholder decision)

**Decision.** Redis is approved for caching, rate limiting, and queue backing. BullMQ is approved for background processing: emails, notifications, report generation, exports, synchronization jobs, scheduled tasks.

**Consequences.**
- No long-running work inside the HTTP request lifecycle (target <500 ms for normal operations).
- All integration synchronization jobs run through BullMQ with retry and dead-letter handling.

---

## ADR-009 — Approved technology stack (confirmation)

**Status:** Accepted

**Decision.** Backend: NestJS + TypeScript (Node.js LTS). Database: PostgreSQL. ORM: Prisma (raw SQL/views permitted for complex financial reporting). Admin: Next.js + React + TypeScript. Mobile: Flutter (existing app retained). Auth: JWT + Refresh Tokens + RBAC with data scoping. Storage: MinIO / S3-compatible. Push: FCM. API style: REST + OpenAPI/Swagger, versioned (`/api/v1`). Architecture: API-first Modular Monolith. Deployment: Docker on VPS.

Any change to this stack requires a new ADR with rationale, trade-offs, and stakeholder approval before adoption.

---

## ADR-010 — Modular Monolith now; microservices only by future ADR

**Status:** Accepted

**Decision.** The ERP is built as a single NestJS modular monolith with strict module boundaries (one owner module per entity, no circular dependencies, no direct cross-module data access). Migration to microservices is possible later but requires a dedicated ADR justified by scale evidence.

---

## ADR-011 — Financial core uses an immutable, double-entry ledger

**Status:** Accepted (via analysis approval)

**Decision.** The Finance module implements a double-entry ledger. Financial records are immutable: no deletion, no in-place modification of approved transactions; corrections, cancellations, and refunds are new compensating entries. Restricted funds (campaign/case/fund-designated money) are tracked separately and may never be mixed with general funds. Every transaction records source, destination, fund, cost center, linked entity (campaign/project/case/subscription/box), creator, approver, and timestamps.

---

## ADR-012 — Document precedence order

**Status:** Accepted (via analysis approval)

**Decision.** When project documents conflict, precedence is:

1. **Approved ADRs and the ERP Implementation Constitution** (07_GOVERNANCE)
2. Stakeholder-mandated architecture principles
3. Integration & External Systems Strategy v1; Deployment & Infrastructure Architecture v1 (as amended by ADR-006/007)
4. Build Specification Parts 1–8
5. FRS documents (FRS-001 … FRS-015)
6. Module Specifications (05_MODULE_SPECIFICATIONS)
7. Earlier blueprints and master documents (historical intent)

FRS always outranks Module Specifications. Duplicate module specs: treat the union of features as a backlog; the FRS defines v1 scope; extras (WhatsApp/Telegram channels, Farsi content, OCR, forecasting, visual workflow designer, social media integration) are deferred-phase enhancements.

---

## ADR-013 — Personal User Data separation

**Status:** Accepted (via analysis approval)

**Decision.** Personal User Data (worship/personal records) is mastered by the mobile backend's user-data services (ADR-004). It is never stored in ERP business tables, never appears in ERP reports, and no ERP administrative endpoint may return it. Only anonymous aggregate statistics (e.g., count of completed khatmas) may be exposed, without user identity. If personal data storage is ever consolidated onto ERP infrastructure, it must live in a separate schema with a separate service boundary, no ERP read paths, and column-level encryption — governed by a new ADR.

---

## ADR-014 — Search: PostgreSQL full-text first

**Status:** Accepted (via analysis approval)

**Decision.** v1 uses PostgreSQL full-text search for people, campaigns, content, and documents. Meilisearch (per Build Spec Part 3) is a planned upgrade when search volume or relevance requirements justify an extra service. Elasticsearch is not planned.

---

## ADR-015 — Workflow engine v1 is configuration-driven, not visual

**Status:** Accepted (via analysis approval)

**Decision.** Workflow v1 supports definition of steps, approvers, amount/type conditions, deadlines (SLA), and escalation rules through structured configuration (managed via admin screens backed by JSON definitions), with seeded templates (expense approval, medical case, box request, volunteer application, campaign approval). A drag-and-drop visual designer is a deferred enhancement. Workflow history is immutable and fully audited. No workflow bypass is permitted.

---

## ADR-016 — Authorization is RBAC plus data scoping

**Status:** Accepted (via analysis approval)

**Decision.** Authorization combines role-based permissions (module/action level) with mandatory **data scoping** (row-level): collectors see only assigned boxes, regional staff see only their region, project managers see only their projects, financial-amount visibility is a separate permission, and sensitive fields (phones, addresses, IDs, medical files) carry independent permissions. Scoping is part of the Phase-1 authorization design, not a later addition.

---

## ADR-017 — Incremental channel integration

**Status:** Accepted (via analysis approval)

**Decision.** Channel integrations (mobile, website, boxes) proceed incrementally per module as each ERP module reaches production quality — starting with donations — rather than after the entire ERP is complete. This supersedes the "ERP first, integrations second, always" sequencing of the Master AI Build Instruction.

---

## ADR-018 — External systems are non-authoritative; ERP defines all contracts; assessment phase cancelled

**Status:** Accepted (explicit stakeholder decision, 2026-07-16)

**Context.** The original roadmaps required a Phase-0 assessment of the existing Mobile App, Mobile Backend, Website Backend, and Boxes Dashboard before ERP implementation. The stakeholder has ruled these systems temporary, incomplete, and non-authoritative.

**Decision.**
1. **No assessment of existing systems will be performed.** The assessment phase is cancelled.
2. Existing external systems **must not influence** ERP architecture, database design, module design, workflows, permissions, integrations, or implementation decisions.
3. **The ERP is the primary system and the source of architectural truth.** The ERP designs its integration contracts exactly as required by the governance documents; external systems will later be adapted, rebuilt, extended, or replaced **to match the ERP** — never the reverse.
4. ERP implementation proceeds immediately and is never blocked waiting on any external system.

**Consequences.**
- The Hub Model (ADR-001…005) stands, amended in direction of authority: the ERP **publishes** the integration contracts (Integration Architecture §§3–7) as requirements that external systems must implement; adapters are built against ERP-defined contracts, with stub/fixture implementations until real systems conform.
- Open decision OD-8 (identity migration strategy) is deferred until an external system is aligned; it no longer blocks any ERP phase.
- Integration Architecture §3 note on "Phase 0 contract deliverable from the Boxes side" is reinterpreted: the ERP defines the boxes contract unilaterally; the Boxes system must implement it when aligned.
- The "Assessment & Foundation" phase becomes **Foundation only**.

---

## ADR-019 — Base currency IQD with per-transaction exchange rates (resolves OD-2)

**Status:** Accepted (explicit stakeholder decision, 2026-07-16)

**Decision.**
1. The platform base currency is **IQD**. All ledger balances, fund balances, budgets, and financial reporting are stored and reported in IQD.
2. Multi-currency transactions are supported: each financial transaction stores `currency`, `amountOriginal`, and `exchangeRate`; the posted amount is `amountIqd = amountOriginal × exchangeRate` (rounded to 2 decimals).
3. IQD transactions have `exchangeRate = 1`. Non-IQD transactions must supply the rate at entry time; the rate is immutable once the transaction is approved (compensating entries correct mistakes, per ADR-011).
4. Ledger entries (`debit`/`credit`) are always denominated in IQD.

## ADR-020 — PDFKit behind a renderer abstraction (resolves OD-5)

**Status:** Accepted (explicit stakeholder decision, 2026-07-16)

**Decision.**
1. PDF generation v1 uses **PDFKit**, wrapped behind a `PdfRenderer` abstraction (DI token) so the engine can be replaced without touching business code.
2. Scope: donation receipts, subscription receipts, payment vouchers, financial exports.
3. Arabic/RTL: an Arabic-capable TTF font is registered via `RECEIPT_FONT_PATH`; PDFKit's fontkit performs OpenType shaping. Receipts are laid out right-aligned bilingual (Arabic labels primary). If rendering quality of complex bidi text proves insufficient, the abstraction permits swapping the engine (future ADR).
4. Receipts carry sequential receipt numbers and a QR code encoding receipt number, transaction number, amount, and date; generated PDFs are stored through the Storage module (never in PostgreSQL).

## ADR-021 — Every donation resolves to a Person; lightweight guest Person records (resolves OD-4)

**Status:** Accepted (explicit stakeholder decision, 2026-07-17)

**Decision.**
1. **A donation may never exist without a linked Person** (upholds Constitution Art. 4.2 for the donations domain).
2. Guest donations are allowed. When the donor has no existing identity, the system automatically creates a **lightweight Person record** with minimum fields: name (or `Anonymous Donor` when unavailable), source channel (`sourceSystem`), and donation provenance.
3. Donor resolution order before creating a guest Person: explicit `personId` → identity link (source system + external user id) → verified phone/email contact match. Ambiguous matches still create a guest Person and leave consolidation to the CRM merge workflow (never auto-merge financial history, per Data Ownership Model §6).
4. Public anonymity (`isAnonymousPublic`) hides the donor's name in public channels only; the internal identity link is always retained.

## ADR-022 — Payments are external; the ERP records, never processes (resolves OD-1)

**Status:** Accepted (explicit stakeholder decision, 2026-07-17)

**Context.** OD-1 asked which Iraqi payment gateway(s) (ZainCash, Qi Card, FastPay) the ERP should integrate. The stakeholder has ruled the question itself out of scope: the ERP is not a payment gateway and not a point of payment.

**Decision.**
1. **The ERP never processes payments.** No payment initiation, no gateway sessions, no card/wallet handling, no PCI-scope data inside ERP Core.
2. All payment execution happens in external channel systems: the Foundation mobile app, the Foundation website, the Boxes management system, the Baqiyat Al-Salihat management system, and any future external channel.
3. **Direct integration with ZainCash, Qi Card, FastPay (or any gateway) inside ERP Core is forbidden.** Gateway integrations, if ever needed, live inside the channel systems that own the payment experience.
4. The ERP's responsibility begins **after** payment: receiving completed operations through the integration contracts (ADR-018), recording donations/subscriptions/collections, posting immutable ledger entries (ADR-011), and managing campaigns, reporting, and analytics.
5. **Payment-truth rule (amends the application of Constitution Art. 5.4):** payment truth reaches the ERP as the channel system's *confirmed-payment record*, delivered through the signed, idempotent integration contract (Art. 8.3/8.5) with full provenance (`source_system`, `external_id`, gateway reference in `reference`). The ERP still never trusts an unconfirmed client claim — the trusted party is the integrated channel backend, not the end-user device. Reconciliation jobs compare ERP records against channel statements (Art. 8.3).

**Consequences.**
- OD-1 is **closed**. No gateway adapter, webhook-to-gateway code, or gateway credentials will exist in ERP Core; a future reversal requires a new ADR.
- Phase 5B is redefined from "channel & payment-gateway integration" to **"channel integration"**: external systems submit completed institutional transactions to the existing provenance-aware APIs (donations, subscriptions, collections) via per-system adapters, integration accounts, and signed webhooks (Art. 8.2/8.5). The existing `sourceSystem`/`externalId`/`idempotencyKey` fields and `(source_system, external_id)` uniqueness are the contract foundation — already implemented.
- OD-8 (identity migration/account linking for existing Supabase users) remains the only open decision gating the mobile channel's identity flows.
- The finance module's `PaymentMethod` values (CASH, BANK_TRANSFER, GATEWAY, …) remain **descriptive metadata** about how money moved externally, not an integration surface.

## ADR-023 — Notification strategy: no SMS/Email providers in v1.0; WhatsApp is the official operational channel (resolves OD-3)

**Status:** Accepted (explicit stakeholder decision, 2026-07-17)

**Decision.**
1. ERP v1.0 integrates **no SMS provider and no Email provider**. The dev-logger providers behind the existing channel tokens remain in place; EMAIL/SMS channels stay recorded-but-not-delivered.
2. The Foundation's **official communication channel is institutional WhatsApp**, operated **manually by Foundation staff** ("تشغيلياً"): staff read due communications from the system (in-app feeds, reminder records, communication campaigns) and send them via WhatsApp.
3. The WhatsApp number is **configuration only** (a `configuration` module setting, e.g. `communication.whatsapp_number`) — never hard-coded.
4. Every notification continues to be **recorded inside the system** (notification_records + delivery logs) and is visible to users (`GET /notifications/my`) and to administration (notification history, communication dashboard) — the audit and tracking value of FRS-009 is preserved regardless of the delivery path.
5. **WhatsApp Business API integration is deferred** to a later phase and is explicitly **outside v1.0 scope**; adopting it later requires only a provider class behind the existing provider abstraction plus a new ADR.

**Consequences.** OD-3 is **closed**. Nothing blocks real-time operations: IN_APP and PUSH (FCM-ready) paths are live; installment reminders, receipts and operational alerts surface in-system, and their outward delivery is a staff workflow over WhatsApp until the Business API phase.

---

## ADR-024 — Backup & disaster-recovery targets: RPO 1 hour, RTO 6 hours (resolves OD-6)

**Status:** Accepted (explicit stakeholder decision, 2026-07-17)

**Decision.**
1. **RPO = 1 hour** (maximum tolerable data loss) · **RTO = 6 hours** (maximum tolerable downtime).
2. Implication of RPO 1h: daily dumps alone are insufficient. Production must enable **hourly WAL archiving** (PostgreSQL `archive_command`/pgBackRest shipping to the off-site target) on top of the existing daily/weekly/monthly dump rotation. This is deployment configuration, not application code.
3. RTO 6h is achievable with documented manual restore (dump + WAL replay) on the same or a replacement VPS; no warm standby is required for v1.0.
4. Off-site copies are mandatory (Art. 9.2); the concrete off-site provider/location is an operator implementation detail recorded in `backup.env` and the operations journal — no further ADR needed.
5. The weekly automated restore test and quarterly DR drills (Backup & DR Architecture §5) are the standing evidence that RPO/RTO are actually met.

**Consequences.** OD-6 is **closed**. `ops/backup/backup.env` retention defaults stand (14 daily / 8 weekly / 12 monthly); WAL archiving setup is added to the go-live checklist.

---

## ADR-025 — Production gateway standard: Nginx + Let's Encrypt (resolves OD-7)

**Status:** Accepted (explicit stakeholder decision, 2026-07-17)

**Decision.**
1. The production edge is an **Nginx reverse proxy** on the VPS, terminating TLS with **Let's Encrypt** certificates (auto-renewed), proxying 443 → NestJS on `127.0.0.1:3000`.
2. **PostgreSQL, Redis and MinIO are never publicly exposed** — internal Docker network only (already enforced by `docker-compose.prod.yml`).
3. Nginx responsibilities: TLS, HTTP→HTTPS redirect, HSTS, proxy headers (`X-Forwarded-For/Proto` — the app already runs `trust proxy`), body-size limits for uploads, and optional edge rate limiting complementing the app-level throttler.
4. A dedicated API-gateway product is not adopted for v1.0; any future change follows a new ADR.

**Consequences.** OD-7 is **closed**. The Deployment Guide's "operator's TLS terminator of choice" language is superseded: Nginx + Let's Encrypt is the standard.

---

## Open decisions (require future ADRs before the affected phase)

| # | Decision needed | Blocking phase |
|---|---|---|
| ~~OD-1~~ | ~~Payment gateway provider(s) for Iraq~~ → **resolved by ADR-022: payments are external; ERP records, never processes** | — |
| ~~OD-2~~ | ~~Base currency and multi-currency/FX policy~~ → **resolved by ADR-019** | — |
| ~~OD-3~~ | ~~SMS and Email provider selection~~ → **resolved by ADR-023: no providers in v1.0; institutional WhatsApp operated manually; Business API deferred** | — |
| ~~OD-4~~ | ~~Guest/anonymous donation Person policy~~ → **resolved by ADR-021** | — |
| ~~OD-5~~ | ~~PDF/report engine with Arabic RTL support~~ → **resolved by ADR-020** | — |
| ~~OD-6~~ | ~~Backup RPO/RTO targets and DR location~~ → **resolved by ADR-024: RPO 1h / RTO 6h; hourly WAL archiving + off-site copies** | — |
| ~~OD-7~~ | ~~API gateway implementation~~ → **resolved by ADR-025: Nginx reverse proxy + Let's Encrypt; datastores never public** | — |
| OD-8 | Identity migration & account-linking strategy for existing Supabase users | Phase 5B mobile identity flows only (does not block v1.0) |

---

*End of Architecture Decision Records v1.2 (ADR-001 … ADR-025)*
