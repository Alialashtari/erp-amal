import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SnapshotsService } from './snapshots.service';

export const ANALYTICS_QUEUE = 'analytics';

/**
 * Daily KPI snapshot job (Art. 9.4: heavy aggregation runs in queues, never
 * in the request lifecycle). Captures every KPI scope once per day at 00:15.
 */
@Processor(ANALYTICS_QUEUE)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly snapshots: SnapshotsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'capture-daily') return;
    const { captured } = await this.snapshots.captureDaily();
    this.logger.log(`Captured daily KPI snapshots: ${captured.join(', ')}`);
  }
}
