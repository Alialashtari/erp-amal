import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Growth: percentage change from previous to current (null when no base). */
export function growthPercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/**
 * KPI engine (Phase 8, FRS-013). Read-only aggregation over reporting views
 * and owner-module tables — raw SQL for reporting is permitted (Art. 2,
 * ADR-009). Never writes to other modules' data. Boxes KPIs are derived from
 * the ledger (box collections revenue) until the Boxes integration ships its
 * read-model (ADR-002/017/018): region/collector breakdowns arrive with it.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Executive overview (FRS-013): the whole organization from one screen. */
  async executiveOverview() {
    const [financial, counts] = await Promise.all([this.financialTotals(), this.entityCounts()]);
    return { generatedAt: new Date(), ...financial, ...counts };
  }

  private async financialTotals() {
    const rows = (await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME')  AS total_income,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE') AS total_expense,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'REFUND')  AS total_refunds
      FROM "v_daily_financials"
    `)) as Array<Record<string, unknown>>;
    const r = rows[0] ?? {};
    const totalIncome = num(r.total_income);
    const totalExpense = num(r.total_expense);
    const totalRefunds = num(r.total_refunds);
    const donationRows = (await this.prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM("amountIqd"), 0) AS total, COUNT(DISTINCT "personId") AS donors
      FROM "donations" WHERE "status" = 'COMPLETED'
    `)) as Array<Record<string, unknown>>;
    return {
      totalIncomeIqd: totalIncome,
      totalExpenseIqd: totalExpense,
      totalRefundsIqd: totalRefunds,
      currentBalanceIqd: totalIncome - totalExpense - totalRefunds,
      totalDonationsIqd: num(donationRows[0]?.total),
      donorCount: num(donationRows[0]?.donors),
    };
  }

  private async entityCounts() {
    const [
      activeCampaigns,
      activeSubscriptions,
      medicalCases,
      activeProjects,
      activeVolunteers,
      people,
    ] = await Promise.all([
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.medicalCase.count(),
      this.prisma.project.count({ where: { status: 'ACTIVE' } }),
      this.prisma.volunteerProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.person.count({ where: { status: 'ACTIVE' } }),
    ]);
    return {
      activeCampaigns,
      activeSubscriptions,
      medicalCases,
      activeProjects,
      activeVolunteers,
      totalPeople: people,
    };
  }

  /** Financial KPIs: today / this month / this year, with growth vs previous. */
  async financialKpis() {
    const rows = (await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'  AND day = CURRENT_DATE) AS income_today,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE' AND day = CURRENT_DATE) AS expense_today,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'
          AND day >= date_trunc('month', CURRENT_DATE)) AS income_month,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE'
          AND day >= date_trunc('month', CURRENT_DATE)) AS expense_month,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'
          AND day >= date_trunc('month', CURRENT_DATE - interval '1 month')
          AND day <  date_trunc('month', CURRENT_DATE)) AS income_prev_month,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE'
          AND day >= date_trunc('month', CURRENT_DATE - interval '1 month')
          AND day <  date_trunc('month', CURRENT_DATE)) AS expense_prev_month,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'
          AND day >= date_trunc('year', CURRENT_DATE)) AS income_year,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE'
          AND day >= date_trunc('year', CURRENT_DATE)) AS expense_year,
        SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'
          AND day >= date_trunc('year', CURRENT_DATE - interval '1 year')
          AND day <  date_trunc('year', CURRENT_DATE)) AS income_prev_year
      FROM "v_daily_financials"
    `)) as Array<Record<string, unknown>>;
    const r = rows[0] ?? {};
    const incomeMonth = num(r.income_month);
    const incomeYear = num(r.income_year);
    return {
      today: { incomeIqd: num(r.income_today), expenseIqd: num(r.expense_today) },
      month: {
        incomeIqd: incomeMonth,
        expenseIqd: num(r.expense_month),
        incomeGrowthPercent: growthPercent(incomeMonth, num(r.income_prev_month)),
      },
      year: {
        incomeIqd: incomeYear,
        expenseIqd: num(r.expense_year),
        incomeGrowthPercent: growthPercent(incomeYear, num(r.income_prev_year)),
      },
    };
  }

  /** Monthly income/expense trend for charts (last N months). */
  async monthlyTrend(months = 12) {
    const take = Math.min(Math.max(months, 1), 60);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT month,
             COALESCE(income_iqd, 0)  AS income_iqd,
             COALESCE(expense_iqd, 0) AS expense_iqd,
             COALESCE(refund_iqd, 0)  AS refund_iqd
      FROM "v_monthly_income_expense"
      ORDER BY month DESC
      LIMIT ${take}
    `);
  }

  /** Campaign KPIs: top/bottom performers, completion (FRS-013). */
  async campaignKpis(top = 5) {
    const take = Math.min(Math.max(top, 1), 20);
    const [topCampaigns, bottomCampaigns, statusCounts] = await Promise.all([
      this.prisma.$queryRaw(Prisma.sql`
        SELECT campaign_id, name, name_ar, status, goal_iqd, raised_iqd, donor_count, progress_percent
        FROM "v_campaign_performance"
        WHERE status IN ('ACTIVE', 'COMPLETED')
        ORDER BY raised_iqd DESC LIMIT ${take}
      `),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT campaign_id, name, name_ar, status, goal_iqd, raised_iqd, donor_count, progress_percent
        FROM "v_campaign_performance"
        WHERE status = 'ACTIVE'
        ORDER BY raised_iqd ASC LIMIT ${take}
      `),
      this.prisma.campaign.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      top: topCampaigns,
      weakest: bottomCampaigns,
      byStatus: Object.fromEntries(
        (statusCounts as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
    };
  }

  /** Subscriptions KPIs: active/overdue/renewal (FRS-013). */
  async subscriptionKpis() {
    const [byStatus, overdueInstallments, planHealth, renewal] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.installment.count({ where: { status: 'OVERDUE' } }),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT plan_id, plan_name, category, active_count, paused_count, lapsed_count,
               cancelled_count, active_monthly_value_iqd
        FROM "v_subscription_health" ORDER BY active_count DESC
      `),
      // Renewal proxy: share of due installments (excluding waived/cancelled)
      // that were paid, over the last 90 days.
      this.prisma.$queryRaw(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'PAID')                    AS paid,
          COUNT(*) FILTER (WHERE status IN ('PAID','DUE','OVERDUE')) AS considered
        FROM "installments"
        WHERE "dueDate" >= CURRENT_DATE - interval '90 days'
          AND "dueDate" < CURRENT_DATE
      `),
    ]);
    const renewalRow = (renewal as Array<Record<string, unknown>>)[0] ?? {};
    const considered = num(renewalRow.considered);
    return {
      byStatus: Object.fromEntries(
        (byStatus as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
      overdueInstallments,
      renewalRatePercent: considered
        ? Math.round((num(renewalRow.paid) / considered) * 10000) / 100
        : null,
      plans: planHealth,
    };
  }

  /**
   * Boxes KPIs (FRS-013): until the Boxes read-model integration ships
   * (ADR-002/017/018), total collections come from the ledger (box collections
   * revenue postings); region/collector breakdowns arrive with the adapter.
   */
  async boxesKpis() {
    const rows = (await this.prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(e."creditIqd" - e."debitIqd"), 0) AS total_collected
      FROM "ledger_entries" e
      JOIN "accounts" a ON a."id" = e."accountId"
      WHERE a."code" = '4200'
    `)) as Array<Record<string, unknown>>;
    return {
      totalCollectedIqd: num(rows[0]?.total_collected),
      byRegion: null,
      byCollector: null,
      note: 'Region/collector breakdowns become available with the Boxes integration adapter (ADR-002/017).',
    };
  }

  /** Projects KPIs (FRS-013): counts, completion, delays, budgets. */
  async projectKpis() {
    const now = new Date();
    const [byStatus, delayed, budgets] = await Promise.all([
      this.prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.project.count({
        where: { status: { in: ['ACTIVE', 'PAUSED'] }, endDate: { lt: now } },
      }),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COALESCE(SUM("budgetIqd"), 0) AS total_budget
        FROM "projects" WHERE "status" IN ('ACTIVE', 'PAUSED')
      `),
    ]);
    return {
      byStatus: Object.fromEntries(
        (byStatus as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
      delayedProjects: delayed,
      activeBudgetIqd: num((budgets as Array<Record<string, unknown>>)[0]?.total_budget),
    };
  }

  /** Medical KPIs (FRS-013): cases by stage. */
  async medicalKpis() {
    const byStatus = await this.prisma.medicalCase.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      (byStatus as { status: string; _count: { _all: number } }[]).map((s) => [
        s.status,
        s._count._all,
      ]),
    );
    const totalCases = Object.values(counts).reduce((a, b) => a + (b as number), 0);
    return {
      totalCases,
      underReview: (counts.UNDER_REVIEW ?? 0) + (counts.NEW ?? 0) + (counts.AWAITING_DOCUMENTS ?? 0),
      approved: (counts.APPROVED ?? 0) + (counts.FUNDING ?? 0) + (counts.IN_TREATMENT ?? 0),
      completed: counts.COMPLETED ?? 0,
      byStatus: counts,
    };
  }

  /** HR KPIs (FRS-013): volunteers, staff, approved hours. */
  async hrKpis() {
    const [volunteersByStatus, employees, hours] = await Promise.all([
      this.prisma.volunteerProfile.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.personRole.count({ where: { roleType: 'EMPLOYEE', active: true } }),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COALESCE(SUM("hours"), 0) AS total_hours
        FROM "volunteer_hours" WHERE "status" = 'APPROVED'
      `),
    ]);
    return {
      volunteersByStatus: Object.fromEntries(
        (volunteersByStatus as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
      employees,
      approvedVolunteerHours: num((hours as Array<Record<string, unknown>>)[0]?.total_hours),
    };
  }

  /** Full dashboard payload: every KPI group in one call (executive screen). */
  async fullDashboard() {
    const [overview, financial, campaigns, subscriptions, boxes, projects, medical, hr] =
      await Promise.all([
        this.executiveOverview(),
        this.financialKpis(),
        this.campaignKpis(),
        this.subscriptionKpis(),
        this.boxesKpis(),
        this.projectKpis(),
        this.medicalKpis(),
        this.hrKpis(),
      ]);
    return { overview, financial, campaigns, subscriptions, boxes, projects, medical, hr };
  }
}
