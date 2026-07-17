import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface TimelineEntry {
  personId: string;
  eventType: string;
  module: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  createdBy?: string;
}

/**
 * Person timeline (FRS-001 §18). CRM owns the timeline; other modules append
 * through this service — never by writing the table directly (Art. 3.2).
 */
@Injectable()
export class CrmTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: TimelineEntry): Promise<void> {
    await this.prisma.timelineEvent.create({ data: { ...entry } });
  }

  async forPerson(personId: string, limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const [items, total] = await Promise.all([
      this.prisma.timelineEvent.findMany({
        where: { personId },
        orderBy: { occurredAt: 'desc' },
        take,
        skip: offset,
      }),
      this.prisma.timelineEvent.count({ where: { personId } }),
    ]);
    return { items, total, limit: take, offset };
  }
}
