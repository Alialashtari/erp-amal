import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CrmModule } from '../crm/crm.module';
import { FinanceModule } from '../finance/finance.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { PublicCampaignsController } from './public-campaigns.controller';
import { DonorResolutionService } from './donor-resolution.service';
import { RecurringService } from './recurring.service';
import { RecurringProcessor, RECURRING_QUEUE } from './recurring.processor';

/**
 * Donations & Campaigns module (Phase 4 — completes the ERP v1.0 MVP heart).
 * Owner of Campaign, Donation, RecurringDonation (Data Ownership Model §3).
 * Depends on: crm (donor resolution + timeline), finance (ledger posting),
 * notification (thank-you), storage (media via file ids).
 */
@Module({
  imports: [CrmModule, FinanceModule, BullModule.registerQueue({ name: RECURRING_QUEUE })],
  controllers: [CampaignsController, DonationsController, PublicCampaignsController],
  providers: [
    CampaignsService,
    DonationsService,
    DonorResolutionService,
    RecurringService,
    RecurringProcessor,
  ],
  exports: [DonationsService, CampaignsService],
})
export class DonationsModule implements OnModuleInit {
  constructor(@InjectQueue(RECURRING_QUEUE) private readonly queue: Queue) {}

  /** Registers the repeatable recurring-donation job (every 15 minutes). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'process-due',
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: 'recurring-donations-schedule',
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    );
  }
}
