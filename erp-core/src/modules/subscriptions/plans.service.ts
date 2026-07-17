import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

/** Subscription plan management (FRS-004). Plans are deactivated, never deleted. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(activeOnly = false) {
    return this.prisma.subscriptionPlan.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: CreatePlanDto, actorId: string) {
    const plan = await this.prisma.subscriptionPlan.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'subscriptions',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      newValue: { code: dto.code, category: dto.category ?? 'GENERAL', billingCycle: dto.billingCycle },
    });
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actorId: string) {
    const existing = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plan not found');
    const plan = await this.prisma.subscriptionPlan.update({ where: { id }, data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'SubscriptionPlan',
      entityId: id,
      newValue: dto as never,
    });
    return plan;
  }
}
