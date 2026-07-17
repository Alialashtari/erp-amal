import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { ScopingService, SCOPE_TYPES } from '../authorization/scoping.service';
import { TransactionsService } from '../finance/transactions.service';
import { WorkflowService } from '../workflow/workflow.service';
import { round2 } from '../finance/money';
import { assetAccountCodeFor } from '../donations/donation-rules';
import {
  canTransitionCase,
  MEDICAL_EXPENSE_ACCOUNT_CODE,
  MEDICAL_FUND_CODE,
} from './medical-rules';
import { CreateCaseDto } from './dto/create-case.dto';
import { QueryCasesDto } from './dto/query-cases.dto';
import { RecordTreatmentDto } from './dto/record-treatment.dto';

export const MEDICAL_WORKFLOW_KEY = 'medical_case_review';

/**
 * Medical cases (FRS-006). Every case is a complete file: patient (CRM),
 * committee review (workflow engine, ADR-015), funding (linked financial
 * transactions), treatments, documents (attachments). Cases are never deleted.
 */
@Injectable()
export class MedicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
    private readonly scoping: ScopingService,
    private readonly finance: TransactionsService,
    private readonly workflow: WorkflowService,
  ) {}

  async create(dto: CreateCaseDto, actorId: string) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.medicalCase.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    const patient = await this.prisma.person.findUnique({
      where: { id: dto.patientPersonId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient person not found');

    const medicalCase = await this.prisma.medicalCase.create({
      data: {
        patientPersonId: dto.patientPersonId,
        type: dto.type,
        priority: dto.priority ?? 'MEDIUM',
        diagnosis: dto.diagnosis,
        hospital: dto.hospital,
        doctorName: dto.doctorName,
        requiredAmountIqd: dto.requiredAmountIqd,
        assignedOfficerId: dto.assignedOfficerId,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        createdBy: actorId,
      },
    });

    await this.prisma.personRole.upsert({
      where: { personId_roleType: { personId: dto.patientPersonId, roleType: 'PATIENT' } },
      create: { personId: dto.patientPersonId, roleType: 'PATIENT', assignedBy: actorId },
      update: { active: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'medical',
      entityType: 'MedicalCase',
      entityId: medicalCase.id,
      newValue: { type: dto.type, priority: dto.priority ?? 'MEDIUM' },
    });
    await this.timeline.record({
      personId: dto.patientPersonId,
      eventType: 'MEDICAL_CASE_CREATED',
      module: 'medical',
      title: `Medical case #${medicalCase.caseNumber} opened (${dto.type})`,
      entityType: 'MedicalCase',
      entityId: medicalCase.id,
      createdBy: actorId,
    });
    return medicalCase;
  }

  /** Submits the case to the committee review workflow (FRS-006 sير العمل). */
  async submitForReview(caseId: string, actorId: string) {
    const medicalCase = await this.getOrThrow(caseId);
    if (medicalCase.status !== 'NEW' && medicalCase.status !== 'AWAITING_DOCUMENTS') {
      throw new BadRequestException(`Case cannot be submitted from status ${medicalCase.status}`);
    }
    const wf = await this.workflow.start(MEDICAL_WORKFLOW_KEY, 'MedicalCase', caseId, actorId);
    const updated = await this.prisma.medicalCase.update({
      where: { id: caseId },
      data: { status: 'UNDER_REVIEW', workflowInstanceId: wf.instanceId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'medical',
      entityType: 'MedicalCase',
      entityId: caseId,
      newValue: { status: 'UNDER_REVIEW', workflowInstanceId: wf.instanceId },
    });
    return updated;
  }

  /** Committee/step action; case status follows the workflow outcome. */
  async actOnReview(
    caseId: string,
    action: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT',
    comment: string | undefined,
    actor: { userId: string; permissions: string[] },
  ) {
    const medicalCase = await this.getOrThrow(caseId);
    if (!medicalCase.workflowInstanceId) {
      throw new BadRequestException('Case has no active review workflow');
    }
    const result = await this.workflow.act(medicalCase.workflowInstanceId, action, comment, actor);

    if (result.status === 'APPROVED') {
      await this.prisma.medicalCase.update({
        where: { id: caseId },
        data: { status: 'APPROVED' },
      });
      await this.timeline.record({
        personId: medicalCase.patientPersonId,
        eventType: 'MEDICAL_CASE_APPROVED',
        module: 'medical',
        title: `Medical case #${medicalCase.caseNumber} approved`,
        entityType: 'MedicalCase',
        entityId: caseId,
        createdBy: actor.userId,
      });
    } else if (result.status === 'REJECTED') {
      await this.prisma.medicalCase.update({
        where: { id: caseId },
        data: { status: 'REJECTED', rejectionReason: comment },
      });
    }
    return { case: await this.getOrThrow(caseId), workflow: result };
  }

  async transition(caseId: string, to: string, actorId: string) {
    const medicalCase = await this.getOrThrow(caseId);
    if (!canTransitionCase(medicalCase.status, to)) {
      throw new BadRequestException(`Cannot transition case from ${medicalCase.status} to ${to}`);
    }
    const updated = await this.prisma.medicalCase.update({
      where: { id: caseId },
      data: { status: to as never, ...(to === 'CLOSED' ? { closedAt: new Date() } : {}) },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'medical',
      entityType: 'MedicalCase',
      entityId: caseId,
      oldValue: { status: medicalCase.status },
      newValue: { status: to },
    });
    return updated;
  }

  /** Records a treatment; with a cost it posts a PENDING medical EXPENSE. */
  async recordTreatment(
    caseId: string,
    dto: RecordTreatmentDto,
    actor: { userId: string; permissions: string[] },
  ) {
    const medicalCase = await this.getOrThrow(caseId);
    if (!['APPROVED', 'FUNDING', 'IN_TREATMENT'].includes(medicalCase.status)) {
      throw new BadRequestException(
        `Treatments can only be recorded on approved cases (status: ${medicalCase.status})`,
      );
    }

    let transactionId: string | undefined;
    if (dto.costIqd && dto.costIqd > 0) {
      const fund = await this.prisma.fund.findUnique({ where: { code: MEDICAL_FUND_CODE } });
      if (!fund) throw new BadRequestException('MEDICAL fund is not seeded');
      const [expenseAccount, assetAccount] = await Promise.all([
        this.prisma.account.findUnique({ where: { code: MEDICAL_EXPENSE_ACCOUNT_CODE } }),
        this.prisma.account.findUnique({ where: { code: assetAccountCodeFor(dto.paymentMethod ?? 'CASH') } }),
      ]);
      if (!expenseAccount || !assetAccount) {
        throw new BadRequestException('Chart of accounts is not seeded');
      }
      const tx = await this.finance.create(
        {
          type: 'EXPENSE',
          description: `Medical case #${medicalCase.caseNumber}: ${dto.type} — ${dto.description}`,
          fundId: (fund as { id: string }).id,
          personId: medicalCase.patientPersonId,
          paymentMethod: (dto.paymentMethod ?? 'CASH') as never,
          amountOriginal: dto.costIqd,
          linkedEntityType: 'MedicalCase',
          linkedEntityId: caseId,
          entries: [
            { accountId: (expenseAccount as { id: string }).id, debitIqd: dto.costIqd, creditIqd: 0 },
            { accountId: (assetAccount as { id: string }).id, debitIqd: 0, creditIqd: dto.costIqd },
          ],
        },
        actor,
      );
      transactionId = tx.id;
    }

    const treatment = await this.prisma.medicalTreatment.create({
      data: {
        caseId,
        type: dto.type,
        description: dto.description,
        treatmentDate: dto.treatmentDate ? new Date(dto.treatmentDate) : new Date(),
        costIqd: dto.costIqd,
        transactionId,
        recordedBy: actor.userId,
      },
    });
    if (medicalCase.status !== 'IN_TREATMENT') {
      await this.prisma.medicalCase.update({
        where: { id: caseId },
        data: { status: 'IN_TREATMENT' },
      });
    }
    await this.audit.log({
      userId: actor.userId,
      action: 'CREATE',
      module: 'medical',
      entityType: 'MedicalTreatment',
      entityId: treatment.id,
      newValue: { caseId, type: dto.type, costIqd: dto.costIqd ?? null },
    });
    return treatment;
  }

  async findAll(query: QueryCasesDto, userId: string) {
    // Data scoping (ADR-016): governorate-scoped staff see only cases whose
    // patient lives in their governorates.
    const governorates = await this.scoping.getScopeValues(userId, SCOPE_TYPES.GOVERNORATE);
    const scopedPersonIds = await this.scoping.personIdsForGovernorates(governorates);

    const where: Record<string, unknown> = {
      ...ScopingService.personIdWhere('patientPersonId', scopedPersonIds),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.patientPersonId ? { patientPersonId: query.patientPersonId } : {}),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.medicalCase.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.medicalCase.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  /** Case file with funding summary (FRS-006 التتبع المالي). */
  async findOne(caseId: string) {
    const medicalCase = await this.prisma.medicalCase.findUnique({
      where: { id: caseId },
      include: { treatments: { orderBy: { treatmentDate: 'desc' } } },
    });
    if (!medicalCase) throw new NotFoundException('Medical case not found');

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.financialTransaction.aggregate({
        where: {
          status: 'APPROVED',
          type: 'INCOME',
          linkedEntityType: 'MedicalCase',
          linkedEntityId: caseId,
        },
        _sum: { amountIqd: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: {
          status: 'APPROVED',
          type: 'EXPENSE',
          linkedEntityType: 'MedicalCase',
          linkedEntityId: caseId,
        },
        _sum: { amountIqd: true },
      }),
    ]);
    const raised = Number((incomeAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const spent = Number((expenseAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const required = Number((medicalCase as { requiredAmountIqd: unknown }).requiredAmountIqd ?? 0);

    return {
      ...medicalCase,
      funding: {
        requiredIqd: required,
        raisedIqd: round2(raised),
        spentIqd: round2(spent),
        remainingToRaiseIqd: required > 0 ? round2(Math.max(required - raised, 0)) : null,
        availableIqd: round2(raised - spent),
      },
    };
  }

  private async getOrThrow(caseId: string): Promise<{
    id: string;
    caseNumber: number;
    status: string;
    patientPersonId: string;
    workflowInstanceId: string | null;
  }> {
    const medicalCase = await this.prisma.medicalCase.findUnique({ where: { id: caseId } });
    if (!medicalCase) throw new NotFoundException('Medical case not found');
    return medicalCase as never;
  }
}
