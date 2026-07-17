import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsService } from './transactions.service';
import { round2 } from './money';

/**
 * Financial reporting (FRS-002). Read-only aggregations over APPROVED
 * transactions and their ledger entries. All amounts IQD (ADR-019).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
  ) {}

  /** Balances for every active fund; restricted funds shown independently (Art. 5.3). */
  async fundBalances() {
    const funds = (await this.prisma.fund.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    })) as { id: string; code: string; name: string; type: string }[];
    const balances = await Promise.all(
      funds.map(async (f) => ({
        fundId: f.id,
        code: f.code,
        name: f.name,
        type: f.type,
        balanceIqd: await this.transactions.fundBalance(f.id),
      })),
    );
    return { funds: balances, totalIqd: round2(balances.reduce((s, b) => s + b.balanceIqd, 0)) };
  }

  /** Trial balance: per-account debit/credit sums over approved transactions. */
  async trialBalance(from?: string, to?: string) {
    const entries = (await this.prisma.ledgerEntry.findMany({
      where: {
        transaction: {
          status: 'APPROVED',
          ...(from || to
            ? {
                transactionDate: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
      },
      include: { account: { select: { code: true, name: true, type: true } } },
    })) as {
      accountId: string;
      debitIqd: unknown;
      creditIqd: unknown;
      account: { code: string; name: string; type: string };
    }[];

    const byAccount = new Map<
      string,
      { code: string; name: string; type: string; debitIqd: number; creditIqd: number }
    >();
    for (const e of entries) {
      const row = byAccount.get(e.accountId) ?? {
        code: e.account.code,
        name: e.account.name,
        type: e.account.type,
        debitIqd: 0,
        creditIqd: 0,
      };
      row.debitIqd = round2(row.debitIqd + Number(e.debitIqd));
      row.creditIqd = round2(row.creditIqd + Number(e.creditIqd));
      byAccount.set(e.accountId, row);
    }
    const rows = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
    return {
      rows,
      totalDebitIqd: round2(rows.reduce((s, r) => s + r.debitIqd, 0)),
      totalCreditIqd: round2(rows.reduce((s, r) => s + r.creditIqd, 0)),
    };
  }

  /** Income vs expenses over a period, grouped by type and by cost center. */
  async incomeExpenseSummary(from?: string, to?: string) {
    const txs = (await this.prisma.financialTransaction.findMany({
      where: {
        status: 'APPROVED',
        ...(from || to
          ? {
              transactionDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { costCenter: { select: { code: true, name: true } } },
    })) as {
      type: string;
      amountIqd: unknown;
      costCenter: { code: string; name: string } | null;
    }[];

    let income = 0;
    let expenses = 0;
    let refunds = 0;
    const byCostCenter = new Map<string, { name: string; expenseIqd: number }>();
    for (const t of txs) {
      const amount = Number(t.amountIqd);
      if (t.type === 'INCOME') income = round2(income + amount);
      if (t.type === 'EXPENSE') {
        expenses = round2(expenses + amount);
        const key = t.costCenter?.code ?? 'unassigned';
        const row = byCostCenter.get(key) ?? { name: t.costCenter?.name ?? 'Unassigned', expenseIqd: 0 };
        row.expenseIqd = round2(row.expenseIqd + amount);
        byCostCenter.set(key, row);
      }
      if (t.type === 'REFUND') refunds = round2(refunds + amount);
    }
    return {
      incomeIqd: income,
      expensesIqd: expenses,
      refundsIqd: refunds,
      netIqd: round2(income - expenses - refunds),
      expensesByCostCenter: Object.fromEntries(byCostCenter),
    };
  }

  /** Budget consumption: allocated vs approved expenses in the budget scope/period. */
  async budgetStatus(budgetId: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id: budgetId } });
    if (!budget) return null;
    const b = budget as {
      id: string;
      name: string;
      fundId: string | null;
      costCenterId: string | null;
      periodStart: Date;
      periodEnd: Date;
      allocatedIqd: unknown;
      status: string;
    };
    const agg = (await this.prisma.financialTransaction.aggregate({
      where: {
        status: 'APPROVED',
        type: 'EXPENSE',
        transactionDate: { gte: b.periodStart, lte: b.periodEnd },
        ...(b.fundId ? { fundId: b.fundId } : {}),
        ...(b.costCenterId ? { costCenterId: b.costCenterId } : {}),
      },
      _sum: { amountIqd: true },
    })) as { _sum: { amountIqd: unknown } };
    const consumed = Number(agg._sum.amountIqd ?? 0);
    const allocated = Number(b.allocatedIqd);
    return {
      budgetId: b.id,
      name: b.name,
      status: b.status,
      allocatedIqd: allocated,
      consumedIqd: round2(consumed),
      remainingIqd: round2(allocated - consumed),
      consumptionPercent: allocated > 0 ? round2((consumed / allocated) * 100) : 0,
    };
  }
}
