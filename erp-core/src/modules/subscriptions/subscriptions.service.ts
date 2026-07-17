import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { TransactionsService } from '../finance/transactions.service';
import { assetAccountCodeFor } from '../donations/donation-rules';
import {
  canTransitionSubscription,
  nextDueDate,
  SUBSCRIPTIONS_REVENUE_ACCOUNT_CODE,
} from './subscription-rules';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { QuerySubscriptionsDto } from './dto/query-subscriptions.dto';

/**
 * Subscriptions (FRS-004). A subscription is a Person's long-term commitment
 * to a plan. Installments are generated one cycle ahead; a paid installment
 * posts an INCOME transaction (asset by method → subscriptions revenue 4100,
 * fund = plan fund or GENERAL) and schedules the next cycle. Nothing is ever
 * deleted: full payment/renewal history is retained (Art. 4.4).
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: TransactionsService,
    private readonly timeline: CrmTimelineService,
  ) {}

  async create(dto: CreateSubscriptionDto, actorId: string) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.subscription.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const [person, plan] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: dto.personId }, select: { id: true } }),
      this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } }),
    ]);
    if (!person) throw new NotFoundException('Person not found');
    if (!plan || !(plan as { isActive: boolean }).isActive) {
      throw new BadRequestException('Plan not found or inactive');
    }
    const p = plan as { amountIqd: unknown; allowCustomAmount: boolean; billingCycle: string };

    let amountIqd = Number(p.amountIqd);
    if (dto.amountIqd !== undefined) {
      if (!p.allowCustomAmount) {
        throw new BadRequestException('This plan does not allow custom amounts');
      }
      amountIqd = dto.amountIqd;
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const subscription = await this.prisma.subscription.create({
      data: {
        personId: dto.personId,
        planId: dto.planId,
        amountIqd,
        startDate,
        nextDueDate: startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        autoRenew: dto.autoRenew ?? true,
        beneficiaryPersonId: dto.beneficiaryPersonId,
        notes: dto.notes,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        createdBy: actorId,
      },
    });

    // First installment, due at start.
    await this.prisma.installment.create({
      data: {
        subscriptionId: subscription.id,
        sequence: 1,
        amountIqd,
        dueDate: startDate,
      },
    });

    // Subscriber role on the person (referencing CRM-owned data via upsert semantics).
    await this.prisma.personRole.upsert({
      where: { personId_roleType: { personId: dto.personId, roleType: 'SUBSCRIBER' } },
      create: { personId: dto.personId, roleType: 'SUBSCRIBER', assignedBy: actorId },
      update: { active: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'subscriptions',
      entityType: 'Subscription',
      entityId: subscription.id,
      newValue: { planId: dto.planId, amountIqd, personId: dto.personId },
    });
    await this.timeline.record({
      personId: dto.personId,
      eventType: 'SUBSCRIBED',
      module: 'subscriptions',
      title: `Subscribed to plan (${amountIqd} IQD / ${p.billingCycle.toLowerCase()})`,
      entityType: 'Subscription',
      entityId: subscription.id,
      createdBy: actorId,
    });

    return subscription;
  }

  async payInstallment(
    installmentId: string,
    dto: PayInstallmentDto,
    actor: { userId: string; permissions: string[] },
  ) {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!installment) throw new NotFoundException('Installment not found');
    const inst = installment as {
      id: string;
      status: string;
      sequence: number;
      amountIqd: unknown;
      dueDate: Date;
      subscription: {
        id: string;
        personId: string;
        status: string;
        autoRenew: boolean;
        endDate: Date | null;
        subscriptionNumber: number;
        plan: { billingCycle: string; fundId: string | null };
      };
    };
    if (inst.status !== 'DUE' && inst.status !== 'OVERDUE') {
      throw new BadRequestException(`Installment is not payable (status: ${inst.status})`);
    }

    // Target fund: plan fund or GENERAL.
    let fundId = inst.subscription.plan.fundId;
    if (!fundId) {
      const general = await this.prisma.fund.findUnique({ where: { code: 'GENERAL' } });
      if (!general) throw new BadRequestException('GENERAL fund missing');
      fundId = (general as { id: string }).id;
    }

    const [asset, revenue] = await this.accounts(dto.paymentMethod ?? 'CASH');
    const amount = Number(inst.amountIqd);
    const tx = await this.finance.create(
      {
        type: 'INCOME',
        description: `Subscription #${inst.subscription.subscriptionNumber} installment ${inst.sequence}`,
        fundId,
        personId: inst.subscription.personId,
        paymentMethod: (dto.paymentMethod ?? 'CASH') as never,
        amountOriginal: amount,
        reference: dto.reference,
        linkedEntityType: 'Installment',
        linkedEntityId: inst.id,
        idempotencyKey: `installment:${inst.id}`,
        entries: [
          { accountId: asset, debitIqd: amount, creditIqd: 0 },
          { accountId: revenue, debitIqd: 0, creditIqd: amount },
        ],
      },
      actor,
    );

    const paid = await this.prisma.installment.update({
      where: { id: installmentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: dto.paymentMethod ?? 'CASH',
        reference: dto.reference,
        transactionId: tx.id,
      },
    });

    // Schedule next cycle (unless LIFETIME, cancelled, or past endDate).
    const cycle = inst.subscription.plan.billingCycle;
    const next = nextDueDate(cycle, inst.dueDate);
    const sub = inst.subscription;
    if (
      next &&
      sub.autoRenew &&
      (sub.status === 'ACTIVE' || sub.status === 'LAPSED') &&
      (!sub.endDate || next <= sub.endDate)
    ) {
      await this.prisma.installment.create({
        data: {
          subscriptionId: sub.id,
          sequence: inst.sequence + 1,
          amountIqd: amount,
          dueDate: next,
        },
      });
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { nextDueDate: next, status: 'ACTIVE' }, // payment reactivates LAPSED
      });
    } else {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          nextDueDate: null,
          ...(next === null || (sub.endDate && next && next > sub.endDate)
            ? { status: 'EXPIRED' }
            : {}),
        },
      });
    }

    await this.audit.log({
      userId: actor.userId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'Installment',
      entityId: installmentId,
      newValue: { status: 'PAID', transactionId: tx.id },
    });
    return paid;
  }

  async waiveInstallment(installmentId: string, reason: string, actorId: string) {
    const installment = await this.prisma.installment.findUnique({ where: { id: installmentId } });
    if (!installment) throw new NotFoundException('Installment not found');
    if ((installment as { status: string }).status === 'PAID') {
      throw new BadRequestException('Paid installments cannot be waived');
    }
    const updated = await this.prisma.installment.update({
      where: { id: installmentId },
      data: { status: 'WAIVED', notes: reason },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'Installment',
      entityId: installmentId,
      newValue: { status: 'WAIVED', reason },
    });
    return updated;
  }

  async transition(id: string, to: 'ACTIVE' | 'PAUSED' | 'CANCELLED', actorId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const from = (subscription as { status: string }).status;
    if (!canTransitionSubscription(from, to)) {
      throw new BadRequestException(`Cannot transition subscription from ${from} to ${to}`);
    }
    const updated = await this.prisma.subscription.update({ where: { id }, data: { status: to } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'subscriptions',
      entityType: 'Subscription',
      entityId: id,
      oldValue: { status: from },
      newValue: { status: to },
    });
    return updated;
  }

  async findAll(query: QuerySubscriptionsDto) {
    const where: Record<string, unknown> = {
      ...(query.personId ? { personId: query.personId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { plan: { select: { code: true, name: true, billingCycle: true, category: true } } },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        installments: { orderBy: { sequence: 'asc' } },
        works: { include: { work: true } },
      },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  /** Dashboard summary (FRS-004). */
  async summary() {
    const [byStatus, dueAgg, paidThisMonth] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.installment.aggregate({
        where: { status: { in: ['DUE', 'OVERDUE'] } },
        _sum: { amountIqd: true },
        _count: { id: true },
      }),
      this.prisma.installment.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { amountIqd: true },
      }),
    ]);
    return {
      byStatus: Object.fromEntries(
        (byStatus as { status: string; _count: { id: number } }[]).map((s) => [s.status, s._count.id]),
      ),
      outstanding: {
        count: (dueAgg as { _count: { id: number } })._count.id,
        totalIqd: Number((dueAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0),
      },
      paidThisMonthIqd: Number(
        (paidThisMonth as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0,
      ),
    };
  }

  private async accounts(paymentMethod: string): Promise<[string, string]> {
    const [asset, revenue] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: assetAccountCodeFor(paymentMethod) } }),
      this.prisma.account.findUnique({ where: { code: SUBSCRIPTIONS_REVENUE_ACCOUNT_CODE } }),
    ]);
    if (!asset || !revenue) throw new BadRequestException('Chart of accounts is not seeded');
    return [(asset as { id: string }).id, (revenue as { id: string }).id];
  }
}
