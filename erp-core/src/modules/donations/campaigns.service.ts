import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../finance/transactions.service';
import { round2 } from '../finance/money';
import { canTransitionCampaign } from './donation-rules';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignUpdateDto } from './dto/campaign-update.dto';

/**
 * Campaign lifecycle (FRS-003). Every campaign owns a dedicated RESTRICTED fund
 * (created atomically with the campaign) so its money is structurally isolated
 * (Art. 5.3). Campaigns are never deleted; terminal state is ARCHIVED.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: TransactionsService,
  ) {}

  async create(dto: CreateCampaignDto, actorId: string) {
    // Reserve the campaign fund first (code derived after we know the number).
    // Create campaign + fund in two steps inside a transaction for atomicity.
    const result = await this.prisma.$transaction(async (txc: Prisma.TransactionClient) => {
      const client = txc;
      const fund = await client.fund.create({
        data: {
          code: `CAMP-${Date.now()}`, // provisional, replaced with campaign number below
          name: `Campaign: ${dto.name}`,
          nameAr: dto.nameAr ? `حملة: ${dto.nameAr}` : undefined,
          type: 'RESTRICTED',
          description: 'Dedicated campaign fund (auto-created)',
        },
      });
      const campaign = await client.campaign.create({
        data: {
          name: dto.name,
          nameAr: dto.nameAr,
          description: dto.description,
          type: dto.type ?? 'GENERAL',
          goalAmountIqd: dto.goalAmountIqd,
          targetBeneficiaries: dto.targetBeneficiaries,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          fundId: fund.id,
          managerId: dto.managerId,
          coverImageFileId: dto.coverImageFileId,
          showInApp: dto.showInApp ?? false,
          showInWebsite: dto.showInWebsite ?? false,
          createdBy: actorId,
        },
      });
      await client.fund.update({
        where: { id: fund.id },
        data: { code: `CAMP-${campaign.campaignNumber}` },
      });
      return campaign;
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'donations',
      entityType: 'Campaign',
      entityId: result.id,
      newValue: { name: dto.name, type: dto.type ?? 'GENERAL', fundId: result.fundId },
    });
    return result;
  }

  async update(id: string, dto: UpdateCampaignDto, actorId: string) {
    const campaign = await this.getOrThrow(id);
    if (campaign.status === 'ARCHIVED') {
      throw new BadRequestException('Archived campaigns cannot be modified');
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.goalAmountIqd !== undefined ? { goalAmountIqd: dto.goalAmountIqd } : {}),
        ...(dto.targetBeneficiaries !== undefined
          ? { targetBeneficiaries: dto.targetBeneficiaries }
          : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.coverImageFileId !== undefined ? { coverImageFileId: dto.coverImageFileId } : {}),
        ...(dto.showInApp !== undefined ? { showInApp: dto.showInApp } : {}),
        ...(dto.showInWebsite !== undefined ? { showInWebsite: dto.showInWebsite } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'donations',
      entityType: 'Campaign',
      entityId: id,
      newValue: dto as never,
    });
    return updated;
  }

  async transition(id: string, to: CampaignStatus, actorId: string) {
    const campaign = await this.getOrThrow(id);
    if (!canTransitionCampaign(campaign.status, to)) {
      throw new BadRequestException(`Cannot transition campaign from ${campaign.status} to ${to}`);
    }
    const updated = await this.prisma.campaign.update({ where: { id }, data: { status: to } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'donations',
      entityType: 'Campaign',
      entityId: id,
      oldValue: { status: campaign.status },
      newValue: { status: to },
    });
    return updated;
  }

  async findAll(status?: CampaignStatus, limit = 25, offset = 0) {
    const take = Math.min(limit, 100);
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    const withProgress = await Promise.all(
      (items as { id: string }[]).map((c) => this.withFinancials(c)),
    );
    return { items: withProgress, total, limit: take, offset };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { updates: { orderBy: { publishedAt: 'desc' }, take: 10 } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return this.withFinancials(campaign as { id: string });
  }

  async addUpdate(campaignId: string, dto: CampaignUpdateDto, actorId: string) {
    await this.getOrThrow(campaignId);
    const update = await this.prisma.campaignUpdate.create({
      data: { campaignId, title: dto.title, body: dto.body, imageFileId: dto.imageFileId, createdBy: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'donations',
      entityType: 'CampaignUpdate',
      entityId: update.id,
      newValue: { campaignId, title: dto.title },
    });
    return update;
  }

  /** Financial tracking (FRS-003): raised, spent, remaining, progress. */
  async withFinancials<T extends { id: string }>(campaign: T) {
    const c = campaign as T & { fundId?: string; goalAmountIqd?: unknown };
    const full = c.fundId
      ? c
      : ((await this.prisma.campaign.findUnique({
          where: { id: campaign.id },
        })) as unknown as T & { fundId: string; goalAmountIqd: unknown });

    const [raisedAgg, donorCount, spentAgg] = await Promise.all([
      this.prisma.donation.aggregate({
        where: { campaignId: campaign.id, status: 'COMPLETED' },
        _sum: { amountIqd: true },
        _count: { id: true },
      }),
      this.prisma.donation.findMany({
        where: { campaignId: campaign.id, status: 'COMPLETED' },
        select: { personId: true },
        distinct: ['personId'],
      }),
      this.prisma.financialTransaction.aggregate({
        where: { fundId: (full as { fundId: string }).fundId, status: 'APPROVED', type: 'EXPENSE' },
        _sum: { amountIqd: true },
      }),
    ]);

    const raised = Number((raisedAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const spent = Number((spentAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const goal = Number((full as { goalAmountIqd: unknown }).goalAmountIqd ?? 0);
    const balance = await this.finance.fundBalance((full as { fundId: string }).fundId);

    return {
      ...full,
      financials: {
        raisedIqd: round2(raised),
        spentIqd: round2(spent),
        fundBalanceIqd: balance,
        donationCount: (raisedAgg as { _count: { id: number } })._count.id,
        donorCount: (donorCount as unknown[]).length,
        goalAmountIqd: goal,
        progressPercent: goal > 0 ? round2((raised / goal) * 100) : null,
      },
    };
  }

  private async getOrThrow(id: string): Promise<{ id: string; status: string; fundId: string }> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign as never;
  }
}
