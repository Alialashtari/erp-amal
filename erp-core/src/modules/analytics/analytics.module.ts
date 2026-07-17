import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SnapshotsService } from './snapshots.service';
import { ReportsService } from './reports.service';
import { AnalyticsProcessor, ANALYTICS_QUEUE } from './analytics.processor';

/**
 * Analytics & Executive Dashboard module (Phase 8, FRS-013). Owner of
 * KpiSnapshot and the reporting views (migration 7). Strictly read-only over
 * business data: raw SQL aggregation for reporting is permitted (Art. 2,
 * ADR-009); no AI/ML, no data warehouse (Art. 2 forbidden list) — plain
 * PostgreSQL aggregates and daily snapshots.
 */
@Module({
  imports: [BullModule.registerQueue({ name: ANALYTICS_QUEUE })],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SnapshotsService, ReportsService, AnalyticsProcessor],
  exports: [AnalyticsService, SnapshotsService],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(@InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue) {}

  /** Daily snapshot capture at 00:15 (server time). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'capture-daily',
      {},
      {
        repeat: { pattern: '15 0 * * *' },
        jobId: 'analytics-daily-snapshot',
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    );
  }
}
