import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CrmModule } from '../crm/crm.module';
import { FinanceModule } from '../finance/finance.module';
import { SubscriptionsController } from './subscriptions.controller';
import { BaqiyatController } from './baqiyat.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';
import { BaqiyatService } from './baqiyat.service';
import { BillingProcessor, BILLING_QUEUE } from './billing.processor';

/**
 * Subscriptions & Baqiyat Al-Salihat module (Phase 5A, FRS-004).
 * Owner of SubscriptionPlan, Subscription, Installment, BaqiyatWork
 * (Data Ownership Model §3). Billing housekeeping (overdue marking, lapse
 * detection, reminders) runs hourly via BullMQ.
 */
@Module({
  imports: [CrmModule, FinanceModule, BullModule.registerQueue({ name: BILLING_QUEUE })],
  controllers: [SubscriptionsController, BaqiyatController],
  providers: [SubscriptionsService, PlansService, BaqiyatService, BillingProcessor],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule implements OnModuleInit {
  constructor(@InjectQueue(BILLING_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'billing-housekeeping',
      {},
      {
        repeat: { pattern: '0 * * * *' }, // hourly
        jobId: 'subscriptions-billing-schedule',
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    );
  }
}
