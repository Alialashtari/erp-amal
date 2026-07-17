import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { dueReminderTag, isOverdue, shouldLapse } from './subscription-rules';

export const BILLING_QUEUE = 'subscriptions-billing';
const LAPSE_DAYS = 60; // configurable later via configuration module

/**
 * Billing housekeeping worker (FRS-004): marks overdue installments, lapses
 * subscriptions, and sends due/overdue reminders (7/3/0 days before, 7/30 after).
 * Runs from a repeatable BullMQ job — never in a request lifecycle (Art. 9.4).
 */
@Injectable()
@Processor(BILLING_QUEUE)
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const now = new Date();
    await this.markOverdueAndLapse(now);
    await this.sendReminders(now);
  }

  private async markOverdueAndLapse(now: Date): Promise<void> {
    const open = (await this.prisma.installment.findMany({
      where: { status: { in: ['DUE', 'OVERDUE'] } },
      include: {
        subscription: {
          select: { id: true, status: true, plan: { select: { gracePeriodDays: true } } },
        },
      },
      take: 1000,
    })) as {
      id: string;
      status: string;
      dueDate: Date;
      subscription: { id: string; status: string; plan: { gracePeriodDays: number } };
    }[];

    for (const inst of open) {
      const grace = inst.subscription.plan.gracePeriodDays;
      if (inst.status === 'DUE' && isOverdue(inst.dueDate, grace, now)) {
        await this.prisma.installment.update({
          where: { id: inst.id },
          data: { status: 'OVERDUE' },
        });
      }
      if (
        inst.subscription.status === 'ACTIVE' &&
        shouldLapse(inst.dueDate, LAPSE_DAYS, now)
      ) {
        await this.prisma.subscription.update({
          where: { id: inst.subscription.id },
          data: { status: 'LAPSED' },
        });
        this.logger.log(`Subscription ${inst.subscription.id} lapsed (installment ${inst.id})`);
      }
    }
  }

  private async sendReminders(now: Date): Promise<void> {
    const upcoming = (await this.prisma.installment.findMany({
      where: {
        status: { in: ['DUE', 'OVERDUE'] },
        subscription: { status: { in: ['ACTIVE', 'LAPSED'] } },
      },
      include: { subscription: { select: { personId: true, subscriptionNumber: true } } },
      take: 1000,
    })) as {
      id: string;
      dueDate: Date;
      amountIqd: unknown;
      remindersSent: unknown;
      subscription: { personId: string; subscriptionNumber: number };
    }[];

    for (const inst of upcoming) {
      const sent = Array.isArray(inst.remindersSent) ? (inst.remindersSent as string[]) : [];
      const tag = dueReminderTag(inst.dueDate, now, sent);
      if (!tag) continue;

      const user = await this.prisma.user.findUnique({
        where: { personId: inst.subscription.personId },
        select: { id: true },
      });
      if (user) {
        try {
          await this.notifications.send({
            channel: 'IN_APP',
            recipientUserId: (user as { id: string }).id,
            recipientPersonId: inst.subscription.personId,
            templateKey: 'subscription_reminder',
            data: {
              amount: Number(inst.amountIqd),
              dueDate: inst.dueDate.toISOString().slice(0, 10),
              subscriptionNumber: inst.subscription.subscriptionNumber,
            },
          });
        } catch (error) {
          this.logger.warn(`Reminder failed for installment ${inst.id}: ${(error as Error).message}`);
          continue; // do not mark as sent
        }
      }
      // Mark the tag even without a linked user account (no channel available).
      await this.prisma.installment.update({
        where: { id: inst.id },
        data: { remindersSent: [...sent, tag] as Prisma.InputJsonValue },
      });
    }
  }
}
