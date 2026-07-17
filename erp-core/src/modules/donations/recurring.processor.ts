import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RecurringService } from './recurring.service';

export const RECURRING_QUEUE = 'donations-recurring';

/** BullMQ worker for the recurring-donation schedule (registered repeatable in the module). */
@Processor(RECURRING_QUEUE)
export class RecurringProcessor extends WorkerHost {
  constructor(private readonly recurring: RecurringService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.recurring.processDue();
  }
}
