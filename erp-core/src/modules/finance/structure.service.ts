import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, FundType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Financial structure: chart of accounts, funds, cost centers.
 * Structure records are deactivated, never deleted (Art. 4.4).
 */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── accounts ──
  listAccounts() {
    return this.prisma.account.findMany({ orderBy: { code: 'asc' } });
  }

  async createAccount(
    dto: { code: string; name: string; nameAr?: string; type: AccountType; parentId?: string },
    actorId: string,
  ) {
    const account = await this.prisma.account.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'Account',
      entityId: account.id,
      newValue: { code: dto.code, name: dto.name, type: dto.type },
    });
    return account;
  }

  async setAccountActive(id: string, isActive: boolean, actorId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    const updated = await this.prisma.account.update({ where: { id }, data: { isActive } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'finance',
      entityType: 'Account',
      entityId: id,
      newValue: { isActive },
    });
    return updated;
  }

  // ── funds ──
  listFunds() {
    return this.prisma.fund.findMany({ orderBy: { code: 'asc' } });
  }

  async createFund(
    dto: { code: string; name: string; nameAr?: string; type?: FundType; description?: string },
    actorId: string,
  ) {
    const fund = await this.prisma.fund.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'Fund',
      entityId: fund.id,
      newValue: { code: dto.code, name: dto.name, type: dto.type ?? 'GENERAL' },
    });
    return fund;
  }

  async setFundActive(id: string, isActive: boolean, actorId: string) {
    const fund = await this.prisma.fund.findUnique({ where: { id } });
    if (!fund) throw new NotFoundException('Fund not found');
    const updated = await this.prisma.fund.update({ where: { id }, data: { isActive } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'finance',
      entityType: 'Fund',
      entityId: id,
      newValue: { isActive },
    });
    return updated;
  }

  // ── cost centers ──
  listCostCenters() {
    return this.prisma.costCenter.findMany({ orderBy: { code: 'asc' } });
  }

  async createCostCenter(
    dto: { code: string; name: string; nameAr?: string; parentId?: string },
    actorId: string,
  ) {
    const cc = await this.prisma.costCenter.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'CostCenter',
      entityId: cc.id,
      newValue: { code: dto.code, name: dto.name },
    });
    return cc;
  }

  // ── approval rules ──
  listApprovalRules() {
    return this.prisma.approvalRule.findMany({ orderBy: [{ transactionType: 'asc' }, { minAmountIqd: 'asc' }] });
  }

  async upsertApprovalRule(
    dto: {
      id?: string;
      transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'REFUND';
      minAmountIqd: number;
      requiredPermission: string;
      description?: string;
      isActive?: boolean;
    },
    actorId: string,
  ) {
    if (!dto.requiredPermission.startsWith('finance.')) {
      throw new BadRequestException('Approval permission must belong to the finance module');
    }
    const rule = dto.id
      ? await this.prisma.approvalRule.update({ where: { id: dto.id }, data: { ...dto, id: undefined } })
      : await this.prisma.approvalRule.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: dto.id ? 'UPDATE' : 'CREATE',
      module: 'finance',
      entityType: 'ApprovalRule',
      entityId: (rule as { id: string }).id,
      newValue: {
        transactionType: dto.transactionType,
        minAmountIqd: dto.minAmountIqd,
        requiredPermission: dto.requiredPermission,
      },
    });
    return rule;
  }
}
