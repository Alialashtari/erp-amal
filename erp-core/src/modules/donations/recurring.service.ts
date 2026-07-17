import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DonationsService } from './donations.service';
import { nextRunDate } from './donation-rules';
import { CreateRecurringDto } from './dto/create-recurring.dto';

/**
 * Recurring donations (FRS-003). A recurring plan generates PENDING donations
 * when due (collection is confirmed manually or by gateway → complete()).
 * Processing runs from a BullMQ repeatable job (never in a request lifecycle).
 */
@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly donations: DonationsService,
  ) {}

  async create(dto: CreateRecurringDto, actorId: string) {
    let fundId = dto.fundId;
    if (dto.campaignId) {
      const campaign = await this.prisma.campaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign) throw new NotFoundException('Campaign not found');
      fundId = (campaign as { fundId: string }).fundId;
    }
    if (!fundId) {
      const general = await this.prisma.fund.findUnique({ where: { code: 'GENERAL' } });
      if (!general) throw new BadRequestException('No target fund and GENERAL fund missing');
      fundId = (general as { id: string }).id;
    }
    const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
    if (!person) throw new NotFoundException('Person not found');

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const recurring = await this.prisma.recurringDonation.create({
      data: {
        personId: dto.personId,
        campaignId: dto.campaignId,
        fundId,
        frequency: dto.frequency,
        currency: (dto.currency ?? 'IQD').toUpperCase(),
        amountOriginal: dto.amountOriginal,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        startDate,
        nextRunAt: startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'donations',
      entityType: 'RecurringDonation',
      entityId: recurring.id,
      newValue: { frequency: dto.frequency, amountOriginal: dto.amountOriginal },
    });
    return recurring;
  }

  async setStatus(id: string, status: 'ACTIVE' | 'PAUSED' | 'CANCELLED', actorId: string) {
    const existing = await this.prisma.recurringDonation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recurring donation not found');
    const updated = await this.prisma.recurringDonation.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'donations',
      entityType: 'RecurringDonation',
      entityId: id,
      oldValue: { status: (existing as { status: string }).status },
      newValue: { status },
    });
    return updated;
  }

  findAll(limit = 50, offset = 0) {
    return this.prisma.recurringDonation.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
    });
  }

  /** Called by the BullMQ repeatable job. Generates due PENDING donations. */
  async processDue(now: Date = new Date()): Promise<{ generated: number; completed: number }> {
    const due = (await this.prisma.recurringDonation.findMany({
      where: { status: 'ACTIVE', nextRunAt: { lte: now } },
      take: 200,
    })) as {
      id: string;
      personId: string;
      campaignId: string | null;
      fundId: string;
      frequency: string;
      currency: string;
      amountOriginal: unknown;
      paymentMethod: string;
      nextRunAt: Date;
      endDate: Date | null;
    }[];

    let generated = 0;
    let completed = 0;
    for (const plan of due) {
      if (plan.endDate && plan.nextRunAt > plan.endDate) {
        await this.prisma.recurringDonation.update({
          where: { id: plan.id },
          data: { status: 'COMPLETED' },
        });
        completed += 1;
        continue;
      }
      try {
        // Idempotent per plan+due date (Art. 4.3).
        const dueKey = `recurring:${plan.id}:${plan.nextRunAt.toISOString().slice(0, 10)}`;
        await this.prisma.donation.upsert({
          where: { idempotencyKey: dueKey },
          update: {},
          create: {
            personId: plan.personId,
            campaignId: plan.campaignId,
            fundId: plan.fundId,
            status: 'PENDING',
            currency: plan.currency,
            amountOriginal: Number(plan.amountOriginal),
            exchangeRate: 1,
            amountIqd: Number(plan.amountOriginal), // non-IQD recurring resolves rate at completion
            paymentMethod: plan.paymentMethod as never,
            donationDate: plan.nextRunAt,
            recurringDonationId: plan.id,
            idempotencyKey: dueKey,
            createdBy: 'system:recurring',
          },
        });
        await this.prisma.recurringDonation.update({
          where: { id: plan.id },
          data: { nextRunAt: nextRunDate(plan.frequency, plan.nextRunAt) },
        });
        generated += 1;
      } catch (error) {
        this.logger.error(`Recurring plan ${plan.id} failed: ${(error as Error).message}`);
      }
    }
    if (generated > 0 || completed > 0) {
      this.logger.log(`Recurring donations processed: ${generated} generated, ${completed} plans completed`);
    }
    return { generated, completed };
  }
}
