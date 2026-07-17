import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/**
 * Periodic reports (FRS-013): monthly and yearly consolidated summaries built
 * from the reporting views. Custom reports = same primitives with a date
 * range. Read-only raw SQL (Art. 2 / ADR-009).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(year: number, month: number) {
    if (month < 1 || month > 12) throw new BadRequestException('month must be 1–12');
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    return this.rangeReport(from, to, `monthly:${year}-${String(month).padStart(2, '0')}`);
  }

  async yearly(year: number) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    return this.rangeReport(from, to, `yearly:${year}`);
  }

  async custom(from: Date, to: Date) {
    if (!(from < to)) throw new BadRequestException('from must be before to');
    return this.rangeReport(from, to, 'custom');
  }

  /** Consolidated income/expense/donations/subscriptions for a period. */
  private async rangeReport(from: Date, to: Date, label: string) {
    const [financials, byFund, donations, newSubscriptions, campaignIncome] = await Promise.all([
      this.prisma.$queryRaw(Prisma.sql`
        SELECT
          COALESCE(SUM(total_iqd) FILTER (WHERE transaction_type = 'INCOME'), 0)  AS income_iqd,
          COALESCE(SUM(total_iqd) FILTER (WHERE transaction_type = 'EXPENSE'), 0) AS expense_iqd,
          COALESCE(SUM(total_iqd) FILTER (WHERE transaction_type = 'REFUND'), 0)  AS refund_iqd
        FROM "v_daily_financials"
        WHERE day >= ${from} AND day < ${to}
      `),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT f."code" AS fund_code, f."name" AS fund_name, f."type" AS fund_type,
               v.transaction_type,
               COALESCE(SUM(v.total_iqd), 0) AS total_iqd
        FROM "v_daily_financials" v
        JOIN "funds" f ON f."id" = v.fund_id
        WHERE v.day >= ${from} AND v.day < ${to}
        GROUP BY f."code", f."name", f."type", v.transaction_type
        ORDER BY f."code"
      `),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*) AS donation_count,
               COALESCE(SUM("amountIqd"), 0) AS total_iqd,
               COUNT(DISTINCT "personId") AS donors
        FROM "donations"
        WHERE "status" = 'COMPLETED' AND "donationDate" >= ${from} AND "donationDate" < ${to}
      `),
      this.prisma.subscription.count({
        where: { createdAt: { gte: from, lt: to } },
      }),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT c."id" AS campaign_id, c."name", c."nameAr" AS name_ar,
               COALESCE(SUM(d."amountIqd"), 0) AS raised_iqd,
               COUNT(*) AS donation_count
        FROM "donations" d
        JOIN "campaigns" c ON c."id" = d."campaignId"
        WHERE d."status" = 'COMPLETED' AND d."donationDate" >= ${from} AND d."donationDate" < ${to}
        GROUP BY c."id"
        ORDER BY raised_iqd DESC
        LIMIT 10
      `),
    ]);
    const f = (financials as Array<Record<string, unknown>>)[0] ?? {};
    const d = (donations as Array<Record<string, unknown>>)[0] ?? {};
    return {
      report: label,
      period: { from, to },
      totals: {
        incomeIqd: num(f.income_iqd),
        expenseIqd: num(f.expense_iqd),
        refundIqd: num(f.refund_iqd),
        netIqd: num(f.income_iqd) - num(f.expense_iqd) - num(f.refund_iqd),
      },
      byFund,
      donations: {
        count: num(d.donation_count),
        totalIqd: num(d.total_iqd),
        donors: num(d.donors),
      },
      newSubscriptions,
      topCampaigns: campaignIncome,
    };
  }
}
