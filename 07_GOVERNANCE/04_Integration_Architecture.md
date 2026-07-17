# Amal Foundation Platform — Integration Architecture

**Version:** 1.0
**Status:** Approved
**Date:** 2026-07-16
**Governing ADRs:** ADR-001 … ADR-005, ADR-008, ADR-017

---

## 1. Integration philosophy

The ERP connects systems; it does not replace them (ADR-001). All integration is **API-contract-based**: the ERP depends only on documented, versioned contracts — never on any external system's UI, database, or source code. Each external system gets a dedicated **adapter** inside the ERP integration layer (anti-corruption layer). Replacing a system replaces only its adapter (ADR-005).

```
External System ──(its API / webhooks)──► Adapter ──(internal interfaces)──► ERP modules
ERP modules ──(internal interfaces)──► Adapter ──(its API)──► External System
```

## 2. Integration patterns

| Pattern | Use | Mechanism |
|---|---|---|
| **Push (inbound)** | Channel submits institutional transaction (donation, request, registration, collection) | Channel calls ERP Integration API with idempotency key |
| **Pull (scheduled)** | ERP refreshes replicas (boxes, collectors, stats) | BullMQ scheduled jobs call external APIs; upsert by `(source_system, external_id)` |
| **Publish (outbound)** | ERP publishes campaigns, CMS content, statistics, notifications | Channels call ERP public/protected APIs; or ERP pushes via external system's API |
| **Webhook (event)** | Payment confirmations, external system events | Signed webhooks into ERP webhook module → queue → handler |
| **Hybrid** | Boxes synchronization | Push for new collections where supported + reconciling pull |

**Reliability rules (all patterns):** idempotency keys on every inbound write; retries with exponential backoff via BullMQ; dead-letter queue with operator alerting; sync-state machine (`pending → synced/under_review → approved/rejected/conflict`); reconciliation jobs that compare source totals to ERP replicas and flag drift; contract tests run against recorded fixtures in CI.

## 3. Boxes system integration (ADR-002)

**Direction ERP ← Boxes (consume):** boxes, collectors, assignments, collection transactions, schedules/routes, statistics, collector performance, audit records.
**Direction ERP → Boxes (provide):** unified Person IDs (identity linkage), campaign/fund designations for boxes, governance decisions (collection approval status), consolidated reports.

**Flow — collection to ledger:**
```
Collector app (offline entry, client UUID)
  → Boxes system (master operational record)
    → push/pull sync → boxes-adapter → ERP boxes read-model (sync_state=under_review)
      → staff/workflow approval in ERP
        → finance module posts Transaction (source_system=boxes, external_id=collection_id)
          → appears in funds, campaign balances, reports, executive dashboard
```

**Requirements on the contract (Phase 0 deliverable):** stable IDs for boxes/collectors/collections; created/updated timestamps for incremental sync; duplicate-safe re-delivery; box-owner identity fields sufficient for Person resolution. If the current Firebase system cannot expose an API, Phase 0 must specify the minimal export/bridge to be built **on the Boxes side**, keeping the ERP contract-only.

## 4. Mobile backend integration (ADR-004)

**ERP receives (push):** registrations (identity linkage), donations, subscription sign-ups/payments, medical assistance requests, box requests, event registrations, volunteer applications, engagement aggregates.
**ERP publishes:** campaigns (live amounts/progress), CMS content, events, subscription plans, user institutional profile (their donations/subscriptions/requests/certificates), notifications (via FCM through the notification module).
**Never crosses this boundary:** Personal User Data (ADR-013) — stays entirely in the mobile backend's user-data services.

**Identity contract:** single sign-on target state — mobile authenticates users and presents a verified identity to ERP APIs; `PersonIdentityLink` maps mobile user IDs to Person IDs. Existing Supabase users are linked progressively (strategy = OD-8): on first institutional transaction, resolve/create Person; ambiguous matches go to merge review.

## 5. Website backend integration (ADR-003)

**ERP receives:** user registrations, donations, subscription registrations, box requests, medical requests, event registrations, volunteer applications, contact/feedback submissions.
**ERP publishes:** campaigns with live progress, projects, news/articles/pages/banners (CMS), events, public statistics, receipts/certificates for the user portal.
**Rule:** the website holds no independent institutional business logic outcome — every accepted transaction is ERP-mastered (Data Ownership §4). The website's technology may change freely; only the adapter contract matters.

## 6. Payment gateway integration (provider = OD-1)

```
Channel initiates payment → gateway session (via payments-adapter)
Gateway → signed webhook → ERP webhook module → verify signature + idempotency
  → mark Donation/Installment paid → post finance Transaction → issue receipt (PDF)
  → notification (thank-you / confirmation) → campaign balance updates
```
Rules: never trust channel-reported payment status — only gateway webhooks/confirmation APIs; store gateway transaction ID as `external_ref`; refunds enter as compensating ledger entries; reconciliation job compares gateway settlement reports to ledger.

## 7. Delivery services

- **FCM:** notification module → FCM; device tokens registered via mobile/website; delivery logs recorded.
- **Email / SMS (providers = OD-3):** provider abstraction layer; all sends queued (BullMQ); template-based; delivery tracking (sent/delivered/opened/failed) written to CommunicationLog and linked to Person.

## 8. API contract governance

1. Every contract documented in OpenAPI, versioned (`/api/v1`, `/api/v2`); breaking changes require a new version and a deprecation window.
2. Integration credentials: per-system service accounts with scoped permissions, rotated secrets, HTTPS only, signed webhooks (HMAC), IP allowlisting where possible.
3. Every integration write is audited (source system, payload hash, result).
4. Rate limits per integration account.
5. Contract tests in CI for every adapter; a contract change without updated tests fails the build.
6. **Future (deferred, needs ADR):** internal event bus (e.g., `donation.created`, `subscription.renewed`, `box.collected`, `medicalCase.approved`) to decouple adapters from modules; v1 uses direct service calls + BullMQ jobs.

## 9. Integration rollout order (per ADR-017)

| Stage | Integration | Prerequisite ERP phase |
|---|---|---|
| 1 | Payment gateway + website/mobile **donations** | Donations module live (Phase 4) |
| 2 | Mobile/website **auth & identity linkage**, user portal (my donations/receipts) | Identity + CRM |
| 3 | **Subscriptions** via mobile/website | Subscriptions module |
| 4 | **Boxes** sync + collection→ledger posting | Finance + boxes read-model |
| 5 | **Medical/box/volunteer requests** from channels | Medical/Workflow modules |
| 6 | **CMS publishing** to website/app; notifications broadcast | CMS + Communication |
| 7 | Statistics/analytics publication; remaining flows | Analytics |

---

*End of Integration Architecture v1.0*
