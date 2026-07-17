# Amal Foundation Platform — Final Data Ownership Model

**Version:** 1.0
**Status:** Approved
**Date:** 2026-07-16
**Governing ADRs:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-011, ADR-013

---

## 1. Ownership principles

1. **Every record has exactly one master.** Either an ERP module or an external system — never both.
2. **Only the master writes.** All other holders keep read-only replicas or references.
3. **Replicas carry provenance.** Any externally-mastered record stored in the ERP must record its source system, external ID, and sync state.
4. **Modules reference, never modify, foreign entities.** Cross-module changes go through the owner module's service interface.
5. **Institutional data vs. Personal User Data never mix** (ADR-013).
6. **No orphan data.** Every institutional business record links to a Person (guest-donation policy = OD-4).
7. **No hard deletes** of institutional data: archive/soft-delete only. Financial and audit records are immutable (ADR-011).

## 2. Data categories

| Category | Definition | Master | Visibility |
|---|---|---|---|
| A — Institutional data | People, money, campaigns, cases, projects, operations, approvals, audit | ERP (or external system with ERP replica) | Per RBAC + scoping |
| B — Personal User Data | Quran notes, bookmarks, khatmas, tasbih, reading/memorization progress, favorites, prayer tracking, personal preferences | Mobile backend user-data services | User only. Never in ERP reports; never visible to administrators; aggregates only, anonymized |

## 3. Master data ownership — ERP-mastered domains

| Entity group | Owner module | Notes |
|---|---|---|
| Person, PersonRole, Relationship, Tag, ContactInfo, Address | **crm** | The one unified Person. All systems resolve to a single Person ID. Merge operations audited and reversible. |
| User, Session, Token, Device | **identity** | User = login account; linked to exactly one Person. A Person may exist without a User. |
| Role, Permission, UserRole, ScopeRule | **authorization** | Includes data-scoping rules (ADR-016). |
| AuditLog, SecurityLog | **audit** | Append-only, immutable, undeletable. |
| Transaction, LedgerEntry, Account, Fund, CostCenter, Budget, Receipt/Voucher | **finance** | Double-entry, immutable (ADR-011). The only financial ledger in the organization. |
| Campaign, Donation, RecurringDonation, CampaignExpense, CampaignUpdate | **donations** | Every donation links Person + target (campaign/project/case/fund) + Transaction. |
| Plan, Subscription, Installment, Renewal, BaqiyatWork | **subscriptions** | Each payment posts a Transaction. |
| MedicalCase, MedicalRequest, CommitteeDecision, Treatment, FundingDecision, AidRecord | **medical** | Case documents classified highly confidential; independent field-level permissions. |
| Program, Project, Activity, Event, Task, Milestone, Participant, AttendanceRecord, Certificate | **projects** | Project budgets reference finance Budget entities. |
| Volunteer, Employee, Team, Committee, Position, VolunteerHours, Evaluation, TrainingRecord | **volunteers** | Organizational profile layered on Person. |
| Audience, Segment, MessageCampaign, CommunicationLog | **communication** | Every message linked to Person profile. |
| Page, Article, News, Banner, Category, MediaMetadata | **cms** | Content served to website and mobile via APIs. |
| Document, DocumentVersion, ArchiveRecord, RetentionPolicy | **documents** | Metadata in PostgreSQL; binaries in MinIO only. |
| NotificationRecord, Template, DeliveryLog | **notification** | |
| Workflow definitions, instances, approvals, history | **workflow** | History immutable. |
| Setting, FeatureFlag | **configuration** | |
| File metadata | **storage** | Binaries never stored in the database. |

## 4. Externally-mastered domains (ERP holds replicas)

| Entity group | Master system | ERP holder | ERP writes? |
|---|---|---|---|
| Box, Collector, BoxAssignment, Collection (operational record), Route, FieldVisit | **Boxes system** | boxes module (read-model) | No — except ERP-side governance state (approval status, financial posting reference) |
| Website-local operations (sessions, form drafts, web analytics) | **Website backend** | Not replicated (only accepted transactions enter ERP) | n/a |
| Mobile-local operations (app settings, device state, engagement telemetry) | **Mobile backend** | Aggregates only | n/a |
| Personal User Data (Category B) | **Mobile backend user-data services** | **Never held in ERP** | Never |

**Boundary rule for submitted transactions:** when a channel (mobile/website/boxes) submits an institutional transaction (donation, subscription, request, collection) and the ERP **accepts** it, the resulting ERP record (Donation, Transaction, MedicalRequest, …) is **ERP-mastered** from that moment. The channel keeps its local operational copy but the ERP record is authoritative for reporting, finance, and governance.

**Financial posting rule for collections:** the Boxes system masters the *operational* collection record; the ERP masters the *financial* Transaction created from an approved collection. The ERP transaction stores provenance back to the source collection.

## 5. Provenance metadata (mandatory on every replica / channel-originated record)

| Field | Meaning |
|---|---|
| source_system | `erp` \| `mobile` \| `website` \| `boxes` \| `manual` \| `gateway` |
| external_id | Record ID in the source system (unique per source) |
| external_ref | Secondary reference (receipt no., gateway txn id) |
| sync_state | `pending` \| `synced` \| `under_review` \| `approved` \| `rejected` \| `conflict` |
| synced_at / source_created_at | Sync vs. origin timestamps |
| idempotency_key | Client-generated UUID; enforces exactly-once acceptance |

Uniqueness constraint `(source_system, external_id)` prevents duplicate ingestion.

## 6. Identity resolution (the "one Person" rule)

- Every inbound record must resolve to a Person via, in order: existing person link → national ID → verified phone → verified email.
- Ambiguous matches create a **pending-merge review**, never an automatic merge of financial history.
- Merges: performed by authorized staff, fully audited, re-link all references, reversible via merge log.
- Cross-system linkage table: `PersonIdentityLink (person_id, source_system, external_user_id)` maps mobile-backend users, website users, and boxes-system users to the single Person.

## 7. Data lifecycle

| Data | Create | Modify | Delete | Retention |
|---|---|---|---|---|
| Person | Any channel (dedup-checked) | Owner module (crm), audited | Never — archive only | Permanent |
| Financial transactions | Owner flows only | **Never** — compensating entries only | Never | Permanent |
| Donations / collections / installments | Channel or staff, via owner module | Status transitions only, audited | Never — cancel/refund via new entries | Permanent |
| Medical cases | Staff / channel request | Owner module, workflow-gated | Never — close/archive | Permanent |
| Audit logs | System | Never | Never | Permanent (partitioned + cold archive) |
| CMS content | cms module | Versioned | Soft delete + version history | Configurable |
| Documents | documents module | New versions only | Retention-policy-governed soft delete | Per RetentionPolicy (values = open decision) |
| Notifications/logs | System | Never | Never | Archival policy after N years |
| Personal User Data | User via mobile app | User | User (their right) | User-controlled; survives device change/reinstall |

## 8. Access boundaries (summary; full matrix in authorization design)

- Financial amounts, balances, and reports: separate permission from operational visibility.
- Sensitive personal fields (phone, address, national ID) and medical files: independent permissions; medical = highly confidential class.
- Data scoping: region/assignment/project-based row filters enforced server-side (ADR-016).
- Personal User Data: no ERP endpoint, no admin role, no report may access it (ADR-013). Compliance is verified by an automated test.

---

*End of Final Data Ownership Model v1.0*
