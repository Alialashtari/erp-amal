import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SnapshotScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

/**
 * KPI snapshot engine (FRS-013 "تقارير لحظية/شهرية/سنوية"): captures each KPI
 * scope daily so trends and as-of history never require recomputation over
 * the whole ledger. Snapshots are upsert-idempotent per (scope, date).
 */
@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Captures all scopes for today. Called by the daily BullMQ job. */
  async captureDaily(): Promise<{ captured: SnapshotScope[] }> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const payloads: Array<[SnapshotScope, unknown]> = [
      ['EXECUTIVE', await this.analytics.executiveOverview()],
      ['FINANCIAL', await this.analytics.financialKpis()],
      ['CAMPAIGNS', await this.analytics.campaignKpis()],
      ['SUBSCRIPTIONS', await this.analytics.subscriptionKpis()],
      ['PROJECTS', await this.analytics.projectKpis()],
      ['MEDICAL', await this.analytics.medicalKpis()],
      ['HR', await this.analytics.hrKpis()],
    ];
    for (const [scope, payload] of payloads) {
      await this.prisma.kpiSnapshot.upsert({
        where: { scope_snapshotDate: { scope, snapshotDate: today } },
        create: { scope, snapshotDate: today, payload: payload as Prisma.InputJsonValue },
        update: { payload: payload as Prisma.InputJsonValue, generatedAt: new Date() },
      });
    }
    return { captured: payloads.map(([scope]) => scope) };
  }

  /** Snapshot history for a scope (trend lines on the executive dashboard). */
  async history(scope: SnapshotScope, days = 30) {
    const take = Math.min(Math.max(days, 1), 365);
    return this.prisma.kpiSnapshot.findMany({
      where: { scope },
      orderBy: { snapshotDate: 'desc' },
      take,
      select: { snapshotDate: true, payload: true, generatedAt: true },
    });
  }

  /** As-of lookup: latest snapshot on or before the given date. */
  async asOf(scope: SnapshotScope, date: Date) {
    const snapshot = await this.prisma.kpiSnapshot.findFirst({
      where: { scope, snapshotDate: { lte: date } },
      orderBy: { snapshotDate: 'desc' },
    });
    if (!snapshot) throw new NotFoundException(`No ${scope} snapshot on or before that date`);
    return snapshot;
  }
}
