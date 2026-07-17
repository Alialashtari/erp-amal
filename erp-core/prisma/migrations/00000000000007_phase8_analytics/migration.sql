-- Amal ERP Core - Phase 8: Analytics & Executive Dashboard (FRS-013)
-- KPI snapshots + SQL reporting read models (raw SQL for reporting is
-- permitted by Constitution Art. 2 / ADR-009). Views are read-only aggregates;
-- analytics never writes to other modules' tables.

CREATE TYPE "SnapshotScope" AS ENUM ('EXECUTIVE', 'FINANCIAL', 'CAMPAIGNS', 'SUBSCRIPTIONS', 'PROJECTS', 'MEDICAL', 'HR');

CREATE TABLE "kpi_snapshots" (
    "id" TEXT NOT NULL,
    "scope" "SnapshotScope" NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kpi_snapshots_scope_snapshotDate_key" ON "kpi_snapshots"("scope", "snapshotDate");
CREATE INDEX "kpi_snapshots_scope_snapshotDate_idx" ON "kpi_snapshots"("scope", "snapshotDate");

-- ─────────────────────────── reporting views ───────────────────────────

-- Daily approved money movement in IQD (income/expense/refund), by fund.
-- Source of truth: approved financial transactions (ADR-011 ledger postings).
CREATE VIEW "v_daily_financials" AS
SELECT
    date_trunc('day', t."transactionDate")::date AS day,
    t."type"                                     AS transaction_type,
    t."fundId"                                   AS fund_id,
    COUNT(*)                                     AS tx_count,
    SUM(t."amountIqd")                           AS total_iqd
FROM "financial_transactions" t
WHERE t."status" = 'APPROVED'
GROUP BY 1, 2, 3;

-- Campaign performance read model: raised (completed donations), donor count,
-- goal progress. Refunds excluded by donation status.
CREATE VIEW "v_campaign_performance" AS
SELECT
    c."id"                                        AS campaign_id,
    c."name"                                      AS name,
    c."nameAr"                                    AS name_ar,
    c."status"                                    AS status,
    c."type"                                      AS type,
    c."goalAmountIqd"                             AS goal_iqd,
    COALESCE(SUM(d."amountIqd") FILTER (WHERE d."status" = 'COMPLETED'), 0) AS raised_iqd,
    COUNT(DISTINCT d."personId") FILTER (WHERE d."status" = 'COMPLETED')    AS donor_count,
    CASE
        WHEN c."goalAmountIqd" IS NULL OR c."goalAmountIqd" = 0 THEN NULL
        ELSE ROUND(
            COALESCE(SUM(d."amountIqd") FILTER (WHERE d."status" = 'COMPLETED'), 0)
            / c."goalAmountIqd" * 100, 2)
    END                                           AS progress_percent
FROM "campaigns" c
LEFT JOIN "donations" d ON d."campaignId" = c."id"
GROUP BY c."id";

-- Subscriptions health read model: per-plan active/lapsed/overdue counts.
CREATE VIEW "v_subscription_health" AS
SELECT
    p."id"                                                       AS plan_id,
    p."name"                                                     AS plan_name,
    p."category"                                                 AS category,
    COUNT(s."id") FILTER (WHERE s."status" = 'ACTIVE')           AS active_count,
    COUNT(s."id") FILTER (WHERE s."status" = 'PAUSED')           AS paused_count,
    COUNT(s."id") FILTER (WHERE s."status" = 'LAPSED')           AS lapsed_count,
    COUNT(s."id") FILTER (WHERE s."status" = 'CANCELLED')        AS cancelled_count,
    COALESCE(SUM(s."amountIqd") FILTER (WHERE s."status" = 'ACTIVE'), 0) AS active_monthly_value_iqd
FROM "subscription_plans" p
LEFT JOIN "subscriptions" s ON s."planId" = p."id"
GROUP BY p."id";

-- Monthly income vs expense trend (approved transactions, IQD).
CREATE VIEW "v_monthly_income_expense" AS
SELECT
    date_trunc('month', t."transactionDate")::date AS month,
    SUM(t."amountIqd") FILTER (WHERE t."type" = 'INCOME')  AS income_iqd,
    SUM(t."amountIqd") FILTER (WHERE t."type" = 'EXPENSE') AS expense_iqd,
    SUM(t."amountIqd") FILTER (WHERE t."type" = 'REFUND')  AS refund_iqd
FROM "financial_transactions" t
WHERE t."status" = 'APPROVED'
GROUP BY 1;

-- Donor activity read model: totals per person (completed donations only).
CREATE VIEW "v_donor_activity" AS
SELECT
    d."personId"            AS person_id,
    COUNT(*)                AS donation_count,
    SUM(d."amountIqd")      AS total_iqd,
    MIN(d."donationDate")   AS first_donation_at,
    MAX(d."donationDate")   AS last_donation_at
FROM "donations" d
WHERE d."status" = 'COMPLETED'
GROUP BY d."personId";
