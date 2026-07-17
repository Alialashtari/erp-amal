import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from './reports.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportsService,
  ) {}

  async create(dto: CreateBudgetDto, actorId: string) {
    if (!dto.fundId && !dto.costCenterId) {
      throw new BadRequestException('A budget must target a fund, a cost center, or both');
    }
    if (new Date(dto.periodEnd) <= new Date(dto.periodStart)) {
      throw new BadRequestException('periodEnd must be after periodStart');
    }
    const budget = await this.prisma.budget.create({
      data: {
        name: dto.name,
        fundId: dto.fundId,
        costCenterId: dto.costCenterId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        allocatedIqd: dto.allocatedIqd,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'Budget',
      entityId: budget.id,
      newValue: { name: dto.name, allocatedIqd: dto.allocatedIqd },
    });
    return budget;
  }

  async findAll() {
    const budgets = (await this.prisma.budget.findMany({ orderBy: { periodStart: 'desc' } })) as {
      id: string;
    }[];
    return Promise.all(budgets.map((b) => this.reports.budgetStatus(b.id)));
  }

  async close(id: string, actorId: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget not found');
    const updated = await this.prisma.budget.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'finance',
      entityType: 'Budget',
      entityId: id,
      newValue: { status: 'CLOSED' },
    });
    return updated;
  }
}
