import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { renderTemplate } from './template.renderer';

export const NOTIFICATIONS_QUEUE_NAME = 'notifications';

export interface SendNotificationInput {
  channel: NotificationChannel;
  recipientUserId?: string;
  recipientPersonId?: string;
  /** Channel address: email / phone / FCM token. Resolved from recipient when omitted. */
  recipientAddress?: string;
  templateKey?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  scheduledAt?: Date;
  createdBy?: string;
}

/**
 * Central notification engine (FRS-009): every outbound message passes through
 * here. Messages are persisted first (notification_records), then queued for
 * delivery via BullMQ (Art. 9.4: no delivery work in the request lifecycle).
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(NOTIFICATIONS_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async send(input: SendNotificationInput) {
    let title = input.title ?? '';
    let body = input.body ?? '';

    if (input.templateKey) {
      const template = await this.prisma.notificationTemplate.findUnique({
        where: { key: input.templateKey },
      });
      if (!template) throw new NotFoundException(`Template '${input.templateKey}' not found`);
      const t = template as { active: boolean; channel: string; subject: string | null; body: string };
      if (!t.active) throw new BadRequestException('Template is inactive');
      if (t.channel !== input.channel) {
        throw new BadRequestException('Template channel does not match requested channel');
      }
      title = renderTemplate(t.subject ?? title, input.data ?? {});
      body = renderTemplate(t.body, input.data ?? {});
    }
    if (!title && !body) throw new BadRequestException('Notification has no content');

    // Resolve delivery address from the recipient user when not explicitly given.
    let address = input.recipientAddress;
    if (!address && input.recipientUserId && input.channel !== 'IN_APP') {
      address = await this.resolveAddress(input.channel, input.recipientUserId);
    }
    if (!address && input.channel !== 'IN_APP') {
      throw new BadRequestException('No delivery address available for this recipient/channel');
    }

    const record = await this.prisma.notificationRecord.create({
      data: {
        channel: input.channel,
        recipientUserId: input.recipientUserId,
        recipientPersonId: input.recipientPersonId,
        recipientAddress: address,
        templateKey: input.templateKey,
        title,
        body,
        data: (input.data as Prisma.InputJsonValue) ?? undefined,
        scheduledAt: input.scheduledAt,
        createdBy: input.createdBy,
        // IN_APP notifications are delivered by persistence itself.
        status: input.channel === 'IN_APP' ? 'SENT' : 'QUEUED',
        sentAt: input.channel === 'IN_APP' ? new Date() : undefined,
      },
    });

    if (input.channel !== 'IN_APP') {
      const delay = input.scheduledAt ? Math.max(input.scheduledAt.getTime() - Date.now(), 0) : 0;
      await this.queue.add(
        'deliver',
        { notificationId: record.id },
        { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100 },
      );
    }

    await this.audit.log({
      userId: input.createdBy ?? null,
      action: 'CREATE',
      module: 'notification',
      entityType: 'NotificationRecord',
      entityId: record.id,
      newValue: { channel: input.channel, templateKey: input.templateKey ?? null },
    });

    return record;
  }

  async myNotifications(userId: string, limit = 25, offset = 0) {
    const take = Math.min(limit, 100);
    const where = { recipientUserId: userId, channel: 'IN_APP' as NotificationChannel };
    const [items, total] = await Promise.all([
      this.prisma.notificationRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
        select: { id: true, title: true, body: true, data: true, status: true, createdAt: true },
      }),
      this.prisma.notificationRecord.count({ where }),
    ]);
    return { items, total, limit: take, offset };
  }

  async findAll(limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const [items, total] = await Promise.all([
      this.prisma.notificationRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
        include: { deliveryLogs: true },
      }),
      this.prisma.notificationRecord.count(),
    ]);
    return { items, total, limit: take, offset };
  }

  private async resolveAddress(
    channel: NotificationChannel,
    userId: string,
  ): Promise<string | undefined> {
    if (channel === 'EMAIL') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return (user as { email: string | null } | null)?.email ?? undefined;
    }
    if (channel === 'SMS') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      });
      return (user as { phone: string | null } | null)?.phone ?? undefined;
    }
    if (channel === 'PUSH') {
      const device = await this.prisma.device.findFirst({
        where: { userId, fcmToken: { not: null } },
        orderBy: { lastSeenAt: 'desc' },
        select: { fcmToken: true },
      });
      return (device as { fcmToken: string | null } | null)?.fcmToken ?? undefined;
    }
    return undefined;
  }
}
