import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { requiredApprovalPermission, ApprovalRuleLike } from './approval.util';
import { fundSign, toIqd, validateEntries } from './money';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

/**
 * Financial transactions (ADR-011, ADR-019).
 * Immutability rules enforced here:
 * - No update path for financial fields. No delete path at all.
 * - PENDING transactions may be approved / rejected / cancelled.
 * - APPROVED transactions may only be corrected by a compensating reversal.
 * - Ledger entries are written exactly once, at creation, and never touched again;
 *   every balance/report query filters on transaction status = APPROVED, so
 *   pending/rejected lines never affect any balance.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
  ) {}

  async create(dto: CreateTransactionDto, actor: { userId: string; permissions: string[] }) {
    // Currency (ADR-019)
    const currency = (dto.currency ?? 'IQD').toUpperCase();
    const exchangeRate = currency === 'IQD' ? 1 : dto.exchangeRate ?? 0;
    if (currency !== 'IQD' && (!dto.exchangeRate || dto.exchangeRate <= 0)) {
      throw new BadRequestException('exchangeRate is required for non-IQD transactions');
    }
    const amountIqd = toIqd(dto.amountOriginal, exchangeRate);

    // Double-entry validation (ADR-011)
    const entryError = validateEntries(dto.entries, amountIqd);
    if (entryError) throw new BadRequestException(entryError);

    // Referential checks
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund || !(fund as { isActive: boolean }).isActive) {
      throw new BadRequestException('Fund not found or inactive');
    }
    if (dto.type === 'TRANSFER') {
      if (!dto.toFundId) throw new BadRequestException('TRANSFER requires toFundId');
      if (dto.toFundId === dto.fundId) {
        throw new BadRequestException('Cannot transfer a fund to itself');
      }
      const toFund = await this.prisma.fund.findUnique({ where: { id: dto.toFundId } });
      if (!toFund) throw new BadRequestException('Destination fund not found');
    }
    const accountIds = [...new Set(dto.entries.map((e) => e.accountId))];
    const accounts = (await this.prisma.account.findMany({
      where: { id: { in: accountIds }, isActive: true },
      select: { id: true },
    })) as { id: string }[];
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException('One or more ledger accounts do not exist or are inactive');
    }

    // Restricted-fund guard (Art. 5.3): expenses from a restricted fund cannot
    // exceed its current balance — restricted money is never silently mixed.
    if (
      (fund as { type: string }).type === 'RESTRICTED' &&
      (dto.type === 'EXPENSE' || dto.type === 'TRANSFER' || dto.type === 'REFUND')
    ) {
      const balance = await this.fundBalance(dto.fundId);
      if (amountIqd > balance) {
        throw new BadRequestException(
          `Restricted fund balance (${balance} IQD) is insufficient for this ${dto.type.toLowerCase()} of ${amountIqd} IQD`,
        );
      }
    }

    // Approval requirement (FRS-002 tiers): INCOME auto-approves (a recorded fact);
    // EXPENSE / TRANSFER / REFUND require the tier permission.
    const autoApprove = dto.type === 'INCOME';

    const transaction = await this.prisma.financialTransaction.create({
      data: {
        type: dto.type,
        status: autoApprove ? 'APPROVED' : 'PENDING',
        description: dto.description,
        transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
        currency,
        amountOriginal: dto.amountOriginal,
        exchangeRate,
        amountIqd,
        fundId: dto.fundId,
        toFundId: dto.toFundId,
        costCenterId: dto.costCenterId,
        personId: dto.personId,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        reference: dto.reference,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
        createdBy: actor.userId,
        ...(autoApprove ? { approvedBy: actor.userId, approvedAt: new Date() } : {}),
      },
    });

    await this.writeLedgerEntriesRaw(transaction.id, dto.fundId, dto.entries);

    await this.audit.log({
      userId: actor.userId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'FinancialTransaction',
      entityId: transaction.id,
      newValue: {
        type: dto.type,
        amountIqd,
        currency,
        fundId: dto.fundId,
        status: autoApprove ? 'APPROVED' : 'PENDING',
      },
    });
    if (dto.personId) {
      await this.timeline.record({
        personId: dto.personId,
        eventType: `FINANCE_${dto.type}`,
        module: 'finance',
        title: `${dto.type} of ${amountIqd} IQD (${dto.description})`,
        entityType: 'FinancialTransaction',
        entityId: transaction.id,
        createdBy: actor.userId,
      });
    }

    return transaction;
  }

  async approve(id: string, actor: { userId: string; permissions: string[] }) {
    const tx = await this.getOrThrow(id);
    if (tx.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING transactions can be approved (status: ${tx.status})`);
    }
    if (tx.createdBy === actor.userId) {
      throw new ForbiddenException('Separation of duties: the creator cannot approve their own transaction');
    }

    const rules = (await this.prisma.approvalRule.findMany({
      where: { isActive: true },
    })) as unknown as ApprovalRuleLike[];
    const needed = requiredApprovalPermission(
      rules.map((r) => ({ ...r, minAmountIqd: Number(r.minAmountIqd) })),
      tx.type,
      Number(tx.amountIqd),
    );
    if (!actor.permissions.includes(needed)) {
      throw new ForbiddenException(`Approving this transaction requires permission: ${needed}`);
    }

    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: actor.userId,
      action: 'APPROVE',
      module: 'finance',
      entityType: 'FinancialTransaction',
      entityId: id,
      newValue: { status: 'APPROVED', requiredPermission: needed },
    });
    return updated;
  }

  async reject(id: string, reason: string, actor: { userId: string; permissions: string[] }) {
    const tx = await this.getOrThrow(id);
    if (tx.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING transactions can be rejected');
    }
    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'REJECT',
      module: 'finance',
      entityType: 'FinancialTransaction',
      entityId: id,
      newValue: { status: 'REJECTED', reason },
    });
    return updated;
  }

  /**
   * Compensating reversal (ADR-011): creates a new APPROVED transaction with
   * mirrored ledger entries. The original record is never modified.
   */
  async reverse(id: string, reason: string, actor: { userId: string; permissions: string[] }) {
    const tx = await this.getOrThrow(id);
    if (tx.status !== 'APPROVED') {
      throw new BadRequestException('Only APPROVED transactions can be reversed');
    }
    const existingReversal = await this.prisma.financialTransaction.findUnique({
      where: { reversesTransactionId: id },
    });
    if (existingReversal) throw new BadRequestException('Transaction already reversed');

    if (!actor.permissions.includes('finance.approve')) {
      throw new ForbiddenException('Reversal requires permission: finance.approve');
    }

    const originalEntries = (await this.prisma.ledgerEntry.findMany({
      where: { transactionId: id },
    })) as { accountId: string; fundId: string; debitIqd: unknown; creditIqd: unknown }[];

    const reversal = await this.prisma.financialTransaction.create({
      data: {
        type: tx.type,
        status: 'APPROVED',
        description: `REVERSAL of #${tx.transactionNumber}: ${reason}`,
        currency: tx.currency,
        amountOriginal: tx.amountOriginal,
        exchangeRate: tx.exchangeRate,
        amountIqd: tx.amountIqd,
        fundId: tx.fundId,
        toFundId: tx.toFundId,
        costCenterId: tx.costCenterId,
        personId: tx.personId,
        paymentMethod: tx.paymentMethod,
        reversesTransactionId: id,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        approvedAt: new Date(),
      },
    });

    // Mirror the entries: debits become credits and vice versa.
    for (const e of originalEntries) {
      await this.prisma.ledgerEntry.create({
        data: {
          transactionId: reversal.id,
          accountId: e.accountId,
          fundId: e.fundId,
          debitIqd: Number(e.creditIqd),
          creditIqd: Number(e.debitIqd),
          memo: `Reversal of transaction ${id}`,
        },
      });
    }

    await this.audit.log({
      userId: actor.userId,
      action: 'UPDATE',
      module: 'finance',
      entityType: 'FinancialTransaction',
      entityId: reversal.id,
      oldValue: { reverses: id },
      newValue: { reason },
    });
    return reversal;
  }

  async findAll(query: QueryTransactionsDto) {
    const where: Record<string, unknown> = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fundId ? { fundId: query.fundId } : {}),
      ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
      ...(query.personId ? { personId: query.personId } : {}),
      ...(query.from || query.to
        ? {
            transactionDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        take,
        skip,
        include: { fund: true, costCenter: true },
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  async findOne(id: string) {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id },
      include: { fund: true, toFund: true, costCenter: true, entries: { include: { account: true } }, receipt: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async fundBalance(fundId: string): Promise<number> {
    const txs = (await this.prisma.financialTransaction.findMany({
      where: {
        status: 'APPROVED',
        OR: [{ fundId }, { toFundId: fundId }],
      },
      select: { type: true, amountIqd: true, fundId: true, toFundId: true },
    })) as { type: TransactionType; amountIqd: unknown; fundId: string; toFundId: string | null }[];

    let balance = 0;
    for (const t of txs) {
      const amount = Number(t.amountIqd);
      if (t.fundId === fundId) balance += fundSign(t.type) * amount;
      if (t.toFundId === fundId && t.type === 'TRANSFER') balance += amount;
    }
    return Math.round(balance * 100) / 100;
  }

  // ── internals ──────────────────────────────────────────────

  private async getOrThrow(id: string): Promise<{
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    transactionNumber: number;
    createdBy: string;
    fundId: string;
    toFundId: string | null;
    costCenterId: string | null;
    personId: string | null;
    currency: string;
    amountOriginal: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    amountIqd: Prisma.Decimal;
    paymentMethod: PaymentMethod;
  }> {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id },
      include: { entries: false },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx as never;
  }

  private async writeLedgerEntriesRaw(
    transactionId: string,
    fundId: string,
    entries: { accountId: string; debitIqd: number; creditIqd: number; memo?: string }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.ledgerEntry.createMany({
      data: entries.map((e) => ({
        transactionId,
        accountId: e.accountId,
        fundId,
        debitIqd: e.debitIqd,
        creditIqd: e.creditIqd,
        memo: e.memo,
      })),
    });
  }
}
