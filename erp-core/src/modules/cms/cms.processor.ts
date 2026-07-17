import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContentService } from './content.service';

export const CMS_QUEUE = 'cms';

/**
 * CMS scheduler: publishes APPROVED content whose publishAt has arrived
 * (FRS-010 scheduled publishing). Runs as a repeatable BullMQ job — no
 * scheduling work in the request lifecycle (Art. 9.4).
 */
@Processor(CMS_QUEUE)
export class CmsProcessor extends WorkerHost {
  private readonly logger = new Logger(CmsProcessor.name);

  constructor(private readonly content: ContentService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'publish-scheduled') return;
    const published = await this.content.publishDueScheduled();
    if (published > 0) this.logger.log(`Scheduler published ${published} content item(s)`);
  }
}
