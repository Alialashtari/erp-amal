import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../finance/transactions.service';
import { toIqd, round2 } from '../finance/money';
import { NotificationService } from '../notification/notification.service';
import { DonorResolutionService } from './donor-resolution.service';
import {
  assetAccountCodeFor,
  DONATIONS_REVENUE_ACCOUNT_CODE,
} from './donation-rules';
import { CreateDonationDto } from './dto/create-donation.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';

/**
 * Donations (FRS-003, ADR-021). Every donation resolves to a Person and always
 * targets a campaign fund or an explicit fund — never an unclassified pool.
 * A COMPLETED donation posts an INCOME transaction into the Phase-3 ledger
 * (debit asset account by payment method, credit donations revenue).
 * Donations are never deleted; refunds are status transitions + compensating
 * REFUND transactions through the finance approval flow.
 */
@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: TransactionsService,
    private readonly donors: DonorResolutionService,
    private readonly notifications: NotificationService,
  ) {}

  async create(dto: CreateDonationDto, actor: { userId: string; permissions: string[] }) {
    // Idempotency (Art. 4.3 / Integration §2)
    if (dto.idempotencyKey) {
      const existing = await this.prisma.donation.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    // Target resolution: campaign fund or explicit fund (FRS-003 core concept).
    let fundId = dto.fundId;
    let campaign: { id: string; status: string; fundId: string; name: string } | null = null;
    if (dto.campaignId) {
      campaign = (await this.prisma.campaign.findUnique({
        where: { id: dto.campaignId },
      })) as { id: string; status: string; fundId: string; name: string } | null;
      if (!campaign) throw new NotFoundException('Campaign not found');
      if (campaign.status !== 'ACTIVE') {
        throw new BadRequestException(`Campaign is not accepting donations (status: ${campaign.status})`);
      }
      fundId = campaign.fundId;
    }
    if (!fundId) {
      const general = await this.prisma.fund.findUnique({ where: { code: 'GENERAL' } });
      if (!general) throw new BadRequestException('No target fund and GENERAL fund missing');
      fundId = (general as { id: string }).id;
    }

    // Donor resolution (ADR-021): a donation can never exist without a Person.
    const { personId, created: guestCreated } = await this.donors.resolve({
      personId: dto.personId,
      externalUserId: dto.externalUserId,
      phone: dto.donorPhone,
      email: dto.donorEmail,
      donorName: dto.donorName,
      sourceSystem: dto.sourceSystem ?? 'ERP',
      actorId: actor.userId,
    });

    const currency = (dto.currency ?? 'IQD').toUpperCase();
    const exchangeRate = currency === 'IQD' ? 1 : dto.exchangeRate ?? 0;
    if (currency !== 'IQD' && exchangeRate <= 0) {
      throw new BadRequestException('exchangeRate is required for non-IQD donations');
    }
    const amountIqd = toIqd(dto.amountOriginal, exchangeRate);
    const status = dto.status ?? 'COMPLETED';

    const donation = await this.prisma.donation.create({
      data: {
        personId,
        campaignId: dto.campaignId,
        fundId,
        status,
        currency,
        amountOriginal: dto.amountOriginal,
        exchangeRate,
        amountIqd,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        donationDate: dto.donationDate ? new Date(dto.donationDate) : new Date(),
        isAnonymousPublic: dto.isAnonymousPublic ?? false,
        notes: dto.notes,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        createdBy: actor.userId,
      },
    });

    let withTx = donation;
    if (status === 'COMPLETED') {
      withTx = (await this.postToLedger(donation.id, actor)) as unknown as typeof donation;
    }

    await this.audit.log({
      userId: actor.userId,
      action: 'CREATE',
      module: 'donations',
      entityType: 'Donation',
      entityId: donation.id,
      newValue: {
        amountIqd,
        currency,
        campaignId: dto.campaignId ?? null,
        fundId,
        status,
        guestPersonCreated: guestCreated,
      },
    });

    // Thank-you notification (best-effort; template optional).
    void this.sendThanks(personId, amountIqd, campaign?.name).catch((e: Error) =>
      this.logger.warn(`Thank-you notification failed: ${e.message}`),
    );

    return withTx;
  }

  /** Marks a PENDING donation as COMPLETED (e.g. after gateway confirmation) and posts it. */
  async complete(id: string, actor: { userId: string; permissions: string[] }) {
    const donation = await this.getOrThrow(id);
    if (donation.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING donations can be completed');
    }
    await this.prisma.donation.update({ where: { id }, data: { status: 'COMPLETED' } });
    const updated = await this.postToLedger(id, actor);
    await this.audit.log({
      userId: actor.userId,
      action: 'UPDATE',
      module: 'donations',
      entityType: 'Donation',
      entityId: id,
      newValue: { status: 'COMPLETED' },
    });
    return updated;
  }

  /**
   * Refund (FRS-003: donations are never deleted). Creates a REFUND financial
   * transaction (PENDING — goes through the finance approval tiers) and marks
   * the donation REFUNDED with the linked refund transaction.
   */
  async refund(id: string, reason: string, actor: { userId: string; permissions: string[] }) {
    const donation = await this.getOrThrow(id);
    if (donation.status !== 'COMPLETED') {
      throw new BadRequestException('Only COMPLETED donations can be refunded');
    }

    const [asset, revenue] = await this.accounts(donation.paymentMethod);
    const refundTx = await this.finance.create(
      {
        type: 'REFUND',
        description: `Refund of donation #${donation.donationNumber}: ${reason}`,
        currency: donation.currency,
        amountOriginal: Number(donation.amountOriginal),
        exchangeRate: Number(donation.exchangeRate) === 1 ? undefined : Number(donation.exchangeRate),
        fundId: donation.fundId,
        personId: donation.personId,
        paymentMethod: donation.paymentMethod as never,
        linkedEntityType: 'Donation',
        linkedEntityId: donation.id,
        entries: [
          { accountId: revenue, debitIqd: Number(donation.amountIqd), creditIqd: 0 },
          { accountId: asset, debitIqd: 0, creditIqd: Number(donation.amountIqd) },
        ],
      },
      actor,
    );

    const updated = await this.prisma.donation.update({
      where: { id },
      data: { status: 'REFUNDED', refundTransactionId: refundTx.id },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'UPDATE',
      module: 'donations',
      entityType: 'Donation',
      entityId: id,
      newValue: { status: 'REFUNDED', refundTransactionId: refundTx.id, reason },
    });
    return updated;
  }

  async findAll(query: QueryDonationsDto) {
    const where: Record<string, unknown> = {
      ...(query.personId ? { personId: query.personId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.fundId ? { fundId: query.fundId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
      ...(query.from || query.to
        ? {
            donationDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;
    const [items, total, sumAgg] = await Promise.all([
      this.prisma.donation.findMany({
        where,
        orderBy: { donationDate: 'desc' },
        take,
        skip,
        include: { campaign: { select: { name: true, campaignNumber: true } } },
      }),
      this.prisma.donation.count({ where }),
      this.prisma.donation.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { amountIqd: true } }),
    ]);
    return {
      items,
      total,
      totalCompletedIqd: Number((sumAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async findOne(id: string) {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      include: { campaign: true, recurring: true },
    });
    if (!donation) throw new NotFoundException('Donation not found');
    return donation;
  }

  /** Donor statistics (FRS-001 donations tab / FRS-003 donor profile). */
  async donorStats(personId: string) {
    const [agg, last, campaigns] = await Promise.all([
      this.prisma.donation.aggregate({
        where: { personId, status: 'COMPLETED' },
        _sum: { amountIqd: true },
        _count: { id: true },
        _avg: { amountIqd: true },
      }),
      this.prisma.donation.findFirst({
        where: { personId, status: 'COMPLETED' },
        orderBy: { donationDate: 'desc' },
        select: { donationDate: true, amountIqd: true },
      }),
      this.prisma.donation.findMany({
        where: { personId, status: 'COMPLETED', campaignId: { not: null } },
        select: { campaignId: true },
        distinct: ['campaignId'],
      }),
    ]);
    const a = agg as {
      _sum: { amountIqd: unknown };
      _count: { id: number };
      _avg: { amountIqd: unknown };
    };
    return {
      personId,
      totalIqd: round2(Number(a._sum.amountIqd ?? 0)),
      donationCount: a._count.id,
      averageIqd: round2(Number(a._avg.amountIqd ?? 0)),
      lastDonation: last,
      supportedCampaigns: (campaigns as unknown[]).length,
    };
  }

  // ── internals ──────────────────────────────────────────────

  private async postToLedger(
    donationId: string,
    actor: { userId: string; permissions: string[] },
  ) {
    const donation = await this.getOrThrow(donationId);
    if (donation.transactionId) return donation;

    const [asset, revenue] = await this.accounts(donation.paymentMethod);
    const tx = await this.finance.create(
      {
        type: 'INCOME',
        description: `Donation #${donation.donationNumber}`,
        transactionDate: donation.donationDate.toISOString(),
        currency: donation.currency,
        amountOriginal: Number(donation.amountOriginal),
        exchangeRate: Number(donation.exchangeRate) === 1 ? undefined : Number(donation.exchangeRate),
        fundId: donation.fundId,
        personId: donation.personId,
        paymentMethod: donation.paymentMethod as never,
        sourceSystem: donation.sourceSystem as never,
        linkedEntityType: 'Donation',
        linkedEntityId: donation.id,
        entries: [
          { accountId: asset, debitIqd: Number(donation.amountIqd), creditIqd: 0 },
          { accountId: revenue, debitIqd: 0, creditIqd: Number(donation.amountIqd) },
        ],
      },
      actor,
    );
    return this.prisma.donation.update({
      where: { id: donationId },
      data: { transactionId: tx.id },
    });
  }

  private async accounts(paymentMethod: string): Promise<[string, string]> {
    const assetCode = assetAccountCodeFor(paymentMethod);
    const [asset, revenue] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: assetCode } }),
      this.prisma.account.findUnique({ where: { code: DONATIONS_REVENUE_ACCOUNT_CODE } }),
    ]);
    if (!asset || !revenue) {
      throw new BadRequestException(
        'Chart of accounts is not seeded (missing asset/revenue accounts)',
      );
    }
    return [(asset as { id: string }).id, (revenue as { id: string }).id];
  }

  private async sendThanks(personId: string, amountIqd: number, campaignName?: string) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { key: 'donation_thanks' },
    });
    if (!template || !(template as { active: boolean }).active) return;
    const user = await this.prisma.user.findUnique({ where: { personId }, select: { id: true } });
    if (!user) return; // guest donors without accounts receive receipts through their channel
    await this.notifications.send({
      channel: 'IN_APP',
      recipientUserId: (user as { id: string }).id,
      recipientPersonId: personId,
      templateKey: 'donation_thanks',
      data: { amount: amountIqd, campaign: campaignName ?? 'General Fund' },
    });
  }

  private async getOrThrow(id: string): Promise<{
    id: string;
    donationNumber: number;
    personId: string;
    fundId: string;
    status: string;
    currency: string;
    amountOriginal: unknown;
    exchangeRate: unknown;
    amountIqd: unknown;
    paymentMethod: string;
    donationDate: Date;
    sourceSystem: string;
    transactionId: string | null;
  }> {
    const donation = await this.prisma.donation.findUnique({ where: { id } });
    if (!donation) throw new NotFoundException('Donation not found');
    return donation as never;
  }
}
