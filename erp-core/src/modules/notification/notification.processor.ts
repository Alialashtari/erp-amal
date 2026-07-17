import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE_NAME } from './notification.service';
import { EMAIL_PROVIDER, PUSH_PROVIDER, SMS_PROVIDER } from './providers/provider.tokens';
import {
  EmailProvider,
  ProviderResult,
  PushProvider,
  SmsProvider,
} from './providers/provider.interfaces';

interface DeliverJobData {
  notificationId: string;
}

/**
 * BullMQ worker: delivers queued notifications through channel providers and
 * records every attempt in delivery_logs. Failures are retried by the queue
 * (3 attempts, exponential backoff); final failure marks the record FAILED.
 */
@Processor(NOTIFICATIONS_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    super();
  }

  async process(job: Job<DeliverJobData>): Promise<void> {
    const record = await this.prisma.notificationRecord.findUnique({
      where: { id: job.data.notificationId },
    });
    if (!record) return;
    const r = record as {
      id: string;
      channel: string;
      status: string;
      title: string;
      body: string;
      recipientAddress: string | null;
      data: Record<string, unknown> | null;
    };
    if (r.status === 'CANCELLED' || r.status === 'SENT' || r.status === 'DELIVERED') return;

    let result: ProviderResult;
    try {
      result = await this.dispatch(r);
    } catch (error) {
      result = {
        ok: false,
        providerName: 'unknown',
        response: (error as Error).message,
      };
    }

    await this.prisma.deliveryLog.create({
      data: {
        notificationId: r.id,
        attempt: job.attemptsMade + 1,
        status: result.ok ? 'SENT' : 'FAILED',
        providerName: result.providerName,
        providerResponse: result.response,
      },
    });

    if (result.ok) {
      await this.prisma.notificationRecord.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
      return;
    }

    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      await this.prisma.notificationRecord.update({
        where: { id: r.id },
        data: { status: 'FAILED', error: result.response ?? 'delivery failed' },
      });
      this.logger.warn(`Notification ${r.id} failed permanently: ${result.response}`);
    }
    throw new Error(result.response ?? 'delivery failed'); // let BullMQ retry
  }

  private dispatch(r: {
    channel: string;
    title: string;
    body: string;
    recipientAddress: string | null;
    data: Record<string, unknown> | null;
  }): Promise<ProviderResult> {
    const address = r.recipientAddress ?? '';
    switch (r.channel) {
      case 'PUSH':
        return this.push.send({
          token: address,
          title: r.title,
          body: r.body,
          data: this.stringifyData(r.data),
        });
      case 'EMAIL':
        return this.email.send({ to: address, subject: r.title, html: r.body });
      case 'SMS':
        return this.sms.send({ to: address, text: r.body });
      default:
        return Promise.resolve({
          ok: false,
          providerName: 'none',
          response: `Unsupported channel ${r.channel}`,
        });
    }
  }

  private stringifyData(data: Record<string, unknown> | null): Record<string, string> | undefined {
    if (!data) return undefined;
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  }
}
