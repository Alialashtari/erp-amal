import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommunicationService, COMMUNICATION_QUEUE } from './communication.service';

/**
 * Executes bulk-campaign fan-outs in the background (Art. 9.4 — never in the
 * request lifecycle). Retries with backoff are configured on the job.
 */
@Processor(COMMUNICATION_QUEUE)
export class CommunicationProcessor extends WorkerHost {
  private readonly logger = new Logger(CommunicationProcessor.name);

  constructor(private readonly communication: CommunicationService) {
    super();
  }

  async process(job: Job<{ campaignId: string }>): Promise<void> {
    if (job.name !== 'fan-out') return;
    const { sent, failed } = await this.communication.runFanOut(job.data.campaignId);
    this.logger.log(
      `Campaign ${job.data.campaignId} fan-out complete: sent=${sent} failed=${failed}`,
    );
  }
}
