import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { ScopingService, SCOPE_TYPES } from '../authorization/scoping.service';
import { round2 } from '../finance/money';
import { canTransitionProject, canTransitionTask } from './project-rules';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';

/**
 * Projects & Programs (Phase 6, FRS-007): Program → Project → Activity → Task,
 * participants, attendance. Financial tracking derives from ledger transactions
 * linked via linkedEntityType='Project'. Nothing is deleted (Art. 4.4);
 * scoped staff see only their scoped/managed projects (ADR-016).
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
    private readonly scoping: ScopingService,
  ) {}

  // ── programs ──
  listPrograms() {
    return this.prisma.program.findMany({
      orderBy: { code: 'asc' },
      include: { projects: { select: { id: true, name: true, status: true } } },
    });
  }

  async createProgram(dto: CreateProgramDto, actorId: string) {
    const program = await this.prisma.program.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'Program',
      entityId: program.id,
      newValue: { code: dto.code, name: dto.name },
    });
    return program;
  }

  // ── projects ──
  async createProject(dto: CreateProjectDto, actorId: string) {
    if (dto.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
      if (!program) throw new NotFoundException('Program not found');
    }
    const project = await this.prisma.project.create({
      data: {
        programId: dto.programId,
        name: dto.name,
        nameAr: dto.nameAr,
        category: dto.category,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        managerId: dto.managerId,
        budgetIqd: dto.budgetIqd,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'Project',
      entityId: project.id,
      newValue: { name: dto.name, budgetIqd: dto.budgetIqd ?? null },
    });
    return project;
  }

  async updateProject(id: string, dto: UpdateProjectDto, actorId: string) {
    const project = await this.getProject(id);
    if (project.status === 'ARCHIVED') {
      throw new BadRequestException('Archived projects cannot be modified');
    }
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.budgetIqd !== undefined ? { budgetIqd: dto.budgetIqd } : {}),
        ...(dto.programId !== undefined ? { programId: dto.programId } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'projects',
      entityType: 'Project',
      entityId: id,
      newValue: dto as never,
    });
    return updated;
  }

  async transitionProject(id: string, to: string, actorId: string) {
    const project = await this.getProject(id);
    if (!canTransitionProject(project.status, to)) {
      throw new BadRequestException(`Cannot transition project from ${project.status} to ${to}`);
    }
    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: to as never },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'projects',
      entityType: 'Project',
      entityId: id,
      oldValue: { status: project.status },
      newValue: { status: to },
    });
    return updated;
  }

  async findProjects(query: QueryProjectsDto, userId: string) {
    // PROJECT scoping (ADR-016): scoped users see listed project ids + own managed.
    const projectScopes = await this.scoping.getScopeValues(userId, SCOPE_TYPES.PROJECT);
    const where: Record<string, unknown> = {
      ...ScopingService.projectWhere(projectScopes, projectScopes.length > 0 ? userId : undefined),
      ...(query.status ? { status: query.status } : {}),
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const take = Math.min(query.limit ?? 25, 100);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { program: { select: { code: true, name: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  /** Project file with financials, counts (FRS-007 التقارير). */
  async findProject(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        program: true,
        activities: { orderBy: { scheduledAt: 'desc' }, take: 50 },
        tasks: { orderBy: { createdAt: 'desc' }, take: 100 },
        participants: { take: 500 },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const [expenseAgg, incomeAgg] = await Promise.all([
      this.prisma.financialTransaction.aggregate({
        where: { status: 'APPROVED', type: 'EXPENSE', linkedEntityType: 'Project', linkedEntityId: id },
        _sum: { amountIqd: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { status: 'APPROVED', type: 'INCOME', linkedEntityType: 'Project', linkedEntityId: id },
        _sum: { amountIqd: true },
      }),
    ]);
    const spent = Number((expenseAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const raised = Number((incomeAgg as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0);
    const budget = Number((project as { budgetIqd: unknown }).budgetIqd ?? 0);

    return {
      ...project,
      financials: {
        budgetIqd: budget || null,
        spentIqd: round2(spent),
        raisedIqd: round2(raised),
        remainingBudgetIqd: budget > 0 ? round2(budget - spent) : null,
        budgetUtilizationPercent: budget > 0 ? round2((spent / budget) * 100) : null,
      },
      counts: {
        participants: (project as { participants: unknown[] }).participants.length,
        activities: (project as { activities: unknown[] }).activities.length,
        openTasks: (project as { tasks: { status: string }[] }).tasks.filter(
          (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS',
        ).length,
      },
    };
  }

  // ── activities & attendance ──
  async addActivity(projectId: string, dto: CreateActivityDto, actorId: string) {
    await this.getProject(projectId);
    const activity = await this.prisma.activity.create({
      data: {
        projectId,
        name: dto.name,
        type: dto.type ?? 'GENERAL',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        location: dto.location,
        notes: dto.notes,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'Activity',
      entityId: activity.id,
      newValue: { projectId, name: dto.name },
    });
    return activity;
  }

  async recordAttendance(activityId: string, dto: RecordAttendanceDto, actorId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, projectId: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    const a = activity as { id: string; projectId: string };

    // Only registered participants can be marked (FRS-007).
    const participant = await this.prisma.participant.findUnique({
      where: { projectId_personId: { projectId: a.projectId, personId: dto.personId } },
    });
    if (!participant) {
      throw new BadRequestException('Person is not a registered participant of this project');
    }

    const record = await this.prisma.attendanceRecord.upsert({
      where: { activityId_personId: { activityId, personId: dto.personId } },
      create: { activityId, personId: dto.personId, status: dto.status, recordedBy: actorId },
      update: { status: dto.status, recordedBy: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'projects',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      newValue: { activityId, personId: dto.personId, status: dto.status },
    });
    return record;
  }

  // ── tasks ──
  async addTask(projectId: string, dto: CreateTaskDto, actorId: string) {
    await this.getProject(projectId);
    const task = await this.prisma.projectTask.create({
      data: {
        projectId,
        title: dto.title,
        assignedToPersonId: dto.assignedToPersonId,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'ProjectTask',
      entityId: task.id,
      newValue: { projectId, title: dto.title },
    });
    return task;
  }

  async transitionTask(taskId: string, to: string, actorId: string) {
    const task = await this.prisma.projectTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    const from = (task as { status: string }).status;
    if (!canTransitionTask(from, to)) {
      throw new BadRequestException(`Cannot transition task from ${from} to ${to}`);
    }
    const updated = await this.prisma.projectTask.update({
      where: { id: taskId },
      data: { status: to as never, ...(to === 'DONE' ? { completedAt: new Date() } : {}) },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'projects',
      entityType: 'ProjectTask',
      entityId: taskId,
      oldValue: { status: from },
      newValue: { status: to },
    });
    return updated;
  }

  // ── participants ──
  async addParticipant(projectId: string, dto: AddParticipantDto, actorId: string) {
    await this.getProject(projectId);
    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('Person not found');

    const participant = await this.prisma.participant.upsert({
      where: { projectId_personId: { projectId, personId: dto.personId } },
      create: {
        projectId,
        personId: dto.personId,
        role: dto.role ?? 'PARTICIPANT',
        registeredBy: actorId,
      },
      update: { role: dto.role ?? 'PARTICIPANT' },
    });
    await this.timeline.record({
      personId: dto.personId,
      eventType: 'PROJECT_PARTICIPATION',
      module: 'projects',
      title: `Joined project as ${dto.role ?? 'PARTICIPANT'}`,
      entityType: 'Project',
      entityId: projectId,
      createdBy: actorId,
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'Participant',
      entityId: participant.id,
      newValue: { projectId, personId: dto.personId, role: dto.role ?? 'PARTICIPANT' },
    });
    return participant;
  }

  private async getProject(id: string): Promise<{ id: string; status: string; name: string }> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project as never;
  }
}
