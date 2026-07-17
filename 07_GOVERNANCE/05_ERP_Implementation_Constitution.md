# Amal Foundation Platform — ERP Implementation Constitution

**Version:** 1.2 (Art. 5.4 amended by ADR-022; Art. 9.2 fixed by ADR-024; Art. 12 updated by ADR-022/023/024/025)
**Status:** Approved — MANDATORY
**Date:** 2026-07-16 · amended 2026-07-17

This document is the supreme implementation authority for the Amal Foundation Platform. Every developer, AI agent, and contributor must comply. Where any other document conflicts with this Constitution or the ADRs, this Constitution prevails (ADR-012).

---

## Article 1 — Identity of the platform

1.1 The ERP is a **central management, analytics, governance, workflow, and integration platform** (Hub Model, ADR-001). It is not the primary operational backend of existing systems.
1.2 The Boxes Dashboard, Website Backend, and Mobile Backend remain independent operational systems connected through APIs (ADR-002/003/004).
1.3 Any connected system may be replaced in the future without changing the ERP core (ADR-005). Adapters change; the core does not.
1.4 The ERP is the organization's authority for: the unified Person registry, the financial ledger, campaigns, subscriptions, medical cases, projects, volunteers, content, documents, workflows, permissions, audit, and consolidated reporting.

## Article 2 — Technology (locked; change requires a new ADR)

NestJS + TypeScript (strict mode) · PostgreSQL · Prisma (raw SQL permitted for reporting) · Next.js + React + TypeScript web dashboards (ADR-006) · Flutter mobile app retained · JWT + refresh + RBAC with data scoping · MinIO/S3 storage · FCM push · Redis + BullMQ (ADR-008) · REST + OpenAPI, versioned · Docker on VPS (ADR-007) · API-first Modular Monolith (ADR-010).

Forbidden in v1 without a new ADR: microservices, event bus, data warehouse, Elasticsearch, visual workflow designer, AI/ML features, blockchain, multi-tenancy, desktop clients.

## Article 3 — Architecture rules

3.1 One owner module per entity. No duplicate ownership. Only owners write.
3.2 No circular dependencies. No direct cross-module table access. Cross-module communication through service interfaces only.
3.3 Controllers are thin. Business logic lives in services. Validation at API layer and business layer. Never trust client input.
3.4 All business functionality exposed through documented, versioned REST APIs. No hidden functionality. No system bypasses the API layer; no external direct database access.
3.5 Files live in object storage; the database stores metadata only. No binaries in PostgreSQL.
3.6 All schema changes via migrations. No manual production changes.
3.7 Naming: modules camelCase · tables snake_case · routes kebab-case · env vars UPPER_CASE.

## Article 4 — Data rules

4.1 **One Person.** Every human resolves to exactly one Person ID across all systems and channels. Duplicate detection on phone/email/national ID; merges are staff-approved, audited, reversible. No automatic merge of financial history.
4.2 **No orphan institutional data.** Every business record links to a Person (guest policy pending OD-4).
4.3 **Provenance is mandatory** on every channel-originated or replicated record: source_system, external_id, sync_state, idempotency_key (Data Ownership Model §5).
4.4 **No hard deletes.** Institutional records are archived/soft-deleted. Financial records, donations, collections, audit logs, and workflow history are never deleted and never edited in place.
4.5 **Personal User Data** (worship/personal records) never enters ERP tables, reports, or admin endpoints (ADR-013). An automated test must prove no administrative endpoint can return it. Aggregate statistics only, anonymized.

## Article 5 — Financial integrity (highest-scrutiny domain)

5.1 Double-entry, immutable ledger (ADR-011). Corrections, cancellations, and refunds are compensating entries.
5.2 Every amount answers: where did it come from, why, where did it go, who approved it, when. Every donation links donor + target (campaign/fund/project/case) + payment method + receipt. Every expense links project/activity/campaign + cost center + approval chain + budget.
5.3 **Restricted funds are never mixed.** Campaign/case/fund-designated money keeps an independent balance, independent movements, independent reports.
5.4 Payment truth comes only from confirmed-payment records, never from unconfirmed client claims. *(Amended by ADR-022: the ERP never processes payments; payment execution lives in the external channel systems, and the confirmed-payment record reaches the ERP through the signed, idempotent integration contract with full provenance. No gateway integration exists inside ERP Core.)*
5.5 Amount-tiered approval workflows are mandatory for expenses; thresholds configurable, decisions audited.
5.6 Financial code requires its own test suite: posting rules, balance isolation, immutability, refund flows, reconciliation.

## Article 6 — Security and audit

6.1 HTTPS only. Argon2 hashing. Secrets in secret storage, never in code. Rate limiting on all public endpoints. Secure file uploads.
6.2 Authorization = RBAC + mandatory server-side data scoping (ADR-016). Financial-amount visibility and sensitive fields (phones, addresses, IDs, medical files) carry independent permissions. Medical documents are classified highly confidential.
6.3 Audit is append-only and immutable, covering create/update/delete/approve/reject/export/login/permission changes/financial actions with user, old/new values, IP, device, timestamp. No sensitive operation outside audit.
6.4 Sessions and devices are tracked; forced logout supported; failed logins and anomalous activity raise security alerts.

## Article 7 — Workflow integrity

7.1 Sensitive operations (expenses, medical cases, large donations handling, box requests, hiring, campaign approval) pass through the workflow engine. No bypassing, no hidden approvals, no undocumented transitions.
7.2 Workflow v1 is configuration-driven (ADR-015); every step, decision, comment, and escalation is recorded immutably.

## Article 8 — Integration rules

8.1 Contract-only dependency on external systems: never on their UI, database, or code (Integration Architecture).
8.2 One adapter per external system; adapters are the only code aware of external formats.
8.3 Every inbound write is idempotent (idempotency keys, `(source_system, external_id)` uniqueness). Every sync has retries, dead-letter handling, and reconciliation jobs.
8.4 Integrations ship incrementally per module as modules reach production quality (ADR-017), starting with donations.
8.5 Webhooks are signed and verified. Integration accounts are scoped, rotated, rate-limited, and audited.

## Article 9 — Operations

9.1 Environments dev/test/staging/production, isolated. CI/CD with automated lint, typecheck, tests, build, migration, deploy, and a rollback strategy.
9.2 Backups daily/weekly/monthly with off-site copies and scheduled restore tests. **RPO = 1 hour, RTO = 6 hours (fixed by ADR-024)**: production runs hourly WAL archiving to the off-site target on top of the dump rotation; restore tests and quarterly DR drills are the standing evidence these targets are met.
9.3 Monitoring: application, performance, error, security, audit, and queue health. Background jobs must be observable.
9.4 Performance: <500 ms for normal API operations; heavy work in queues; no long-running processes in the request lifecycle.

## Article 10 — Quality gates (no phase is complete without all of these)

1. Architecture compliance review against this Constitution and the ADRs.
2. Tests passing: unit, integration, API, **permission tests**, **workflow tests**, **financial tests** (where applicable).
3. Documentation updated: module purpose, responsibilities, entities, permissions, APIs (OpenAPI), dependencies, database tables, workflows.
4. Security review (authN/authZ/scoping/audit verified).
5. Deployable artifact: each phase produces working, deployable software.
6. No placeholder architecture, no fake implementations, no unfinished critical flows, no dead code, no temporary hacks in merged code.

## Article 11 — Document precedence (binding restatement of ADR-012)

Constitution & ADRs → stakeholder-mandated principles → Integration/Deployment strategy docs (as amended) → Build Specification Parts 1–8 → FRS-001…015 → Module Specifications → earlier blueprints. **FRS always outranks Module Specifications.** Duplicate-spec extras (WhatsApp/Telegram, Farsi content, OCR, forecasting, visual designer, social integrations) are deferred backlog, not v1 scope.

## Article 12 — Open decisions register

Implementation of an affected area must not begin before its open decision (listed in the ADR document) is resolved by a stakeholder-approved ADR. Resolved: OD-1 (ADR-022), OD-2 (ADR-019), OD-3 (ADR-023), OD-4 (ADR-021), OD-5 (ADR-020), OD-6 (ADR-024), OD-7 (ADR-025). **The only remaining open decision is OD-8** (Supabase identity migration), which gates Phase 5B mobile identity flows only and does not block v1.0. Per ADR-022, no payment processing or gateway integration may ever be implemented in ERP Core without a new ADR; per ADR-023, SMS/Email/WhatsApp-API providers enter only through a new ADR.

## Article 13 — Amendment

This Constitution changes only through a new ADR: stated reason, advantages, disadvantages, and explicit stakeholder approval before adoption.

---

**Definition of success (unchanged from the corpus, restated under the Hub Model):** one Person per human; one financial ledger with full traceability; centralized permissions, workflows, audit, and reporting; mobile, website, and boxes systems connected through stable APIs; leadership able to answer — from one screen — how much came in, from where, how it was spent, who approved it, and what impact it had.

*End of ERP Implementation Constitution v1.0*
