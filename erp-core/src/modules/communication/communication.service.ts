import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AudienceType,
  CommCampaignStatus,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { AudienceResolver } from './audience.resolver';
import { CreateCommCampaignDto } from './dto/create-comm-campaign.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

export const COMMUNICATION_QUEUE = 'communication';

/**
 * Communication Center (Phase 7, FRS-009). Owner of CommunicationCampaign and
 * Announcement. Bulk messages fan out in BullMQ (Art. 9.4) through the central
 * NotificationService — no module sends on its own; every delivery is a
 * notification_record with delivery logs, so tracking and metrics are unified.
 */
@Injectable()
export class CommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly audiences: AudienceResolver,
    @InjectQueue(COMMUNICATION_QUEUE) private readonly queue: Queue,
  ) {}

  // ── bulk campaigns ──

  async createCampaign(dto: CreateCommCampaignDto, actorId: string) {
    if (!dto.templateKey && (!dto.title || !dto.body)) {
      throw new BadRequestException('Provide a templateKey or title and body');
    }
    const campaign = await this.prisma.communicationCampaign.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        templateKey: dto.templateKey,
        title: dto.title ?? '',
        body: dto.body ?? '',
        data: (dto.data as Prisma.InputJsonValue) ?? undefined,
        audienceType: dto.audienceType,
        audienceFilter: (dto.audienceFilter as Prisma.InputJsonValue) ?? undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'communication',
      entityType: 'CommunicationCampaign',
      entityId: (campaign as { id: string }).id,
      newValue: { name: dto.name, channel: dto.channel, audienceType: dto.audienceType },
    });
    return campaign;
  }

  /** Launches a DRAFT campaign: immediate or at scheduledAt (delayed job). */
  async launchCampaign(id: string, actorId: string) {
    const campaign = await this.getCampaign(id);
    const c = campaign as { status: CommCampaignStatus; scheduledAt: Date | null };
    if (c.status !== 'DRAFT') {
      throw new BadRequestException(`Campaign is ${c.status}; only DRAFT campaigns launch`);
    }
    const delay = c.scheduledAt ? Math.max(c.scheduledAt.getTime() - Date.now(), 0) : 0;
    await this.prisma.communicationCampaign.update({
      where: { id },
      data: { status: delay > 0 ? 'SCHEDULED' : 'RUNNING' },
    });
    await this.queue.add(
      'fan-out',
      { campaignId: id },
      { delay, attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50 },
    );
    await this.audit.log({
      userId: actorId,
      action: 'APPROVE',
      module: 'communication',
      entityType: 'CommunicationCampaign',
      entityId: id,
      newValue: { launched: true, delayMs: delay },
    });
    return this.getCampaign(id);
  }

  async cancelCampaign(id: string, actorId: string) {
    const campaign = await this.getCampaign(id);
    const c = campaign as { status: CommCampaignStatus };
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED') {
      throw new BadRequestException(`Campaign is already ${c.status}`);
    }
    const updated = await this.prisma.communicationCampaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      userId: actorId,
      action: 'REJECT',
      module: 'communication',
      entityType: 'CommunicationCampaign',
      entityId: id,
      oldValue: { status: c.status },
      newValue: { status: 'CANCELLED' },
    });
    return updated;
  }

  /** Executes the fan-out (called by the BullMQ processor only). */
  async runFanOut(campaignId: string): Promise<{ sent: number; failed: number }> {
    const campaign = (await this.prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
    })) as
      | {
          id: string;
          status: CommCampaignStatus;
          channel: NotificationChannel;
          templateKey: string | null;
          title: string;
          body: string;
          data: Record<string, unknown> | null;
          audienceType: AudienceType;
          audienceFilter: Record<string, unknown> | null;
        }
      | null;
    if (!campaign) return { sent: 0, failed: 0 };
    if (campaign.status === 'CANCELLED') return { sent: 0, failed: 0 };

    const userIds = await this.audiences.resolveUserIds(
      campaign.audienceType,
      campaign.audienceFilter,
    );
    await this.prisma.communicationCampaign.update({
      where: { id: campaignId },
      data: { status: 'RUNNING', startedAt: new Date(), totalRecipients: userIds.length },
    });

    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.notifications.send({
          channel: campaign.channel,
          recipientUserId: userId,
          templateKey: campaign.templateKey ?? undefined,
          title: campaign.title || undefined,
          body: campaign.body || undefined,
          data: { ...(campaign.data ?? {}), commCampaignId: campaign.id },
        });
        sent += 1;
      } catch {
        // Recipient without a usable address for this channel — count and continue.
        failed += 1;
      }
    }

    await this.prisma.communicationCampaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date(), totalSent: sent, totalFailed: failed },
    });
    return { sent, failed };
  }

  async listCampaigns(status?: CommCampaignStatus, limit = 25, offset = 0) {
    const take = Math.min(limit, 100);
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.communicationCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
      }),
      this.prisma.communicationCampaign.count({ where }),
    ]);
    return { items, total, limit: take, offset };
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.communicationCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Communication campaign not found');
    return campaign;
  }

  // ── announcements ──

  async createAnnouncement(dto: CreateAnnouncementDto, actorId: string) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        audience: dto.audience ?? 'ALL_USERS',
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'communication',
      entityType: 'Announcement',
      entityId: (announcement as { id: string }).id,
      newValue: { title: dto.title },
    });
    return announcement;
  }

  async updateAnnouncement(id: string, dto: UpdateAnnouncementDto, actorId: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.startAt !== undefined
          ? { startAt: dto.startAt ? new Date(dto.startAt) : null }
          : {}),
        ...(dto.endAt !== undefined ? { endAt: dto.endAt ? new Date(dto.endAt) : null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: dto.archived ? 'ARCHIVE' : 'UPDATE',
      module: 'communication',
      entityType: 'Announcement',
      entityId: id,
      newValue: { changed: Object.keys(dto) },
    });
    return updated;
  }

  async listAnnouncements(includeArchived = false) {
    return this.prisma.announcement.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Currently visible announcements (public/in-app surfaces). */
  async activeAnnouncements() {
    const now = new Date();
    const items = await this.prisma.announcement.findMany({
      where: {
        active: true,
        archived: false,
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true, body: true, startAt: true, endAt: true },
    });
    return items;
  }

  /** Hook used by the CMS when public content is published (FRS-010). */
  async announceContentPublished(content: { title: string; type: string; slug: string }) {
    const campaign = await this.prisma.communicationCampaign.create({
      data: {
        name: `content-published:${content.type.toLowerCase()}:${content.slug}`,
        channel: 'PUSH',
        title: 'محتوى جديد',
        body: content.title,
        data: { type: content.type, slug: content.slug } as Prisma.InputJsonValue,
        audienceType: 'ALL_USERS',
        status: 'RUNNING',
        createdBy: 'system',
      },
    });
    await this.queue.add(
      'fan-out',
      { campaignId: (campaign as { id: string }).id },
      { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50 },
    );
  }

  // ── dashboard (FRS-009) ──

  async dashboard() {
    const [byStatus, byChannel, campaigns, active] = await Promise.all([
      this.prisma.notificationRecord.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.notificationRecord.groupBy({ by: ['channel'], _count: { _all: true } }),
      this.prisma.communicationCampaign.count(),
      this.prisma.communicationCampaign.count({
        where: { status: { in: ['SCHEDULED', 'RUNNING'] } },
      }),
    ]);
    const statusCounts = Object.fromEntries(
      (byStatus as { status: string; _count: { _all: number } }[]).map((s) => [
        s.status,
        s._count._all,
      ]),
    );
    const channelCounts = Object.fromEntries(
      (byChannel as { channel: string; _count: { _all: number } }[]).map((c) => [
        c.channel,
        c._count._all,
      ]),
    );
    return {
      messagesByStatus: statusCounts,
      messagesByChannel: channelCounts,
      totalCampaigns: campaigns,
      activeCampaigns: active,
    };
  }
}
