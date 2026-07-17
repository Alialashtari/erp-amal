import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { CreateWorkDto } from './dto/create-work.dto';

/**
 * Baqiyat Al-Salihat executed works (FRS-004): khatmas, sadaqa, feeding,
 * majalis, charity projects. Works link to one or more subscriptions and
 * appear on each subscriber's timeline when executed.
 */
@Injectable()
export class BaqiyatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
  ) {}

  async createWork(dto: CreateWorkDto, actorId: string) {
    const work = await this.prisma.baqiyatWork.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'subscriptions',
      entityType: 'BaqiyatWork',
      entityId: work.id,
      newValue: { type: dto.type, title: dto.title },
    });
    return work;
  }

  async assign(workId: string, subscriptionIds: string[], actorId: string) {
    const work = await this.prisma.baqiyatWork.findUnique({ where: { id: workId } });
    if (!work) throw new NotFoundException('Work not found');
    const subs = (await this.prisma.subscription.findMany({
      where: { id: { in: subscriptionIds } },
      select: { id: true },
    })) as { id: string }[];
    if (subs.length !== subscriptionIds.length) {
      throw new BadRequestException('One or more subscriptions not found');
    }
    for (const subscriptionId of subscriptionIds) {
      await this.prisma.baqiyatWorkAssignment.upsert({
        where: { workId_subscriptionId: { workId, subscriptionId } },
        create: { workId, subscriptionId, assignedBy: actorId },
        update: {},
      });
    }
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'BaqiyatWork',
      entityId: workId,
      newValue: { assignedSubscriptions: subscriptionIds },
    });
    return { workId, assigned: subscriptionIds.length };
  }

  async setStatus(
    workId: string,
    status: 'SCHEDULED' | 'EXECUTED' | 'POSTPONED' | 'CANCELLED',
    actorId: string,
  ) {
    const work = await this.prisma.baqiyatWork.findUnique({
      where: { id: workId },
      include: { assignments: { include: { subscription: { select: { personId: true } } } } },
    });
    if (!work) throw new NotFoundException('Work not found');

    const updated = await this.prisma.baqiyatWork.update({
      where: { id: workId },
      data: {
        status,
        ...(status === 'EXECUTED' ? { executedAt: new Date(), executedBy: actorId } : {}),
      },
    });

    // Executed works appear on each linked subscriber's timeline (FRS-001 §18).
    if (status === 'EXECUTED') {
      const w = work as {
        title: string;
        type: string;
        assignments: { subscription: { personId: string } }[];
      };
      const personIds = [...new Set(w.assignments.map((a) => a.subscription.personId))];
      for (const personId of personIds) {
        await this.timeline.record({
          personId,
          eventType: 'BAQIYAT_WORK_EXECUTED',
          module: 'subscriptions',
          title: `Baqiyat work executed: ${w.title} (${w.type})`,
          entityType: 'BaqiyatWork',
          entityId: workId,
          createdBy: actorId,
        });
      }
    }

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'BaqiyatWork',
      entityId: workId,
      newValue: { status },
    });
    return updated;
  }

  findAll(status?: string, limit = 50, offset = 0) {
    return this.prisma.baqiyatWork.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
      include: { assignments: true },
    });
  }
}
