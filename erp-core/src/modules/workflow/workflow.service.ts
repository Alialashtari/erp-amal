import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveAction, StepDefLike } from './workflow-rules';

export interface WorkflowResult {
  instanceId: string;
  status: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  currentStepSequence: number;
}

/**
 * Reusable workflow engine (ADR-015, FRS-014). Config-driven definitions;
 * per-step permission gating; immutable action history (Art. 7.2).
 * Owning modules start instances and react to completion through the returned
 * status — the engine never mutates business entities itself (Art. 3.2).
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async start(
    definitionKey: string,
    entityType: string,
    entityId: string,
    actorId: string,
  ): Promise<WorkflowResult> {
    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { key: definitionKey },
      include: { steps: true },
    });
    if (!definition || !(definition as { isActive: boolean }).isActive) {
      throw new NotFoundException(`Workflow definition '${definitionKey}' not found or inactive`);
    }
    if ((definition as { steps: unknown[] }).steps.length === 0) {
      throw new BadRequestException('Workflow definition has no steps');
    }
    const existing = await this.prisma.workflowInstance.findUnique({
      where: { definitionKey_entityType_entityId: { definitionKey, entityType, entityId } },
    });
    if (existing && (existing as { status: string }).status === 'IN_PROGRESS') {
      throw new BadRequestException('A workflow is already in progress for this entity');
    }
    if (existing) {
      // Historical instance exists (approved/rejected/cancelled); restart is a
      // deliberate business decision — delete-free restart via new cycle is not
      // supported in v1 to keep the unique history guarantee.
      throw new BadRequestException('This entity already completed this workflow');
    }

    const instance = await this.prisma.workflowInstance.create({
      data: { definitionKey, entityType, entityId, startedBy: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'workflow',
      entityType: 'WorkflowInstance',
      entityId: instance.id,
      newValue: { definitionKey, entityType, entityId },
    });
    return { instanceId: instance.id, status: 'IN_PROGRESS', currentStepSequence: 1 };
  }

  async act(
    instanceId: string,
    action: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT',
    comment: string | undefined,
    actor: { userId: string; permissions: string[] },
  ): Promise<WorkflowResult> {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { definition: { include: { steps: true } } },
    });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    const inst = instance as {
      id: string;
      status: string;
      currentStepSequence: number;
      definition: { steps: StepDefLike[] };
    };
    if (inst.status !== 'IN_PROGRESS') {
      throw new BadRequestException(`Workflow is not in progress (status: ${inst.status})`);
    }

    // Comments do not move the workflow but still require step permission.
    if (action === 'COMMENT') {
      const step = inst.definition.steps.find((s) => s.sequence === inst.currentStepSequence);
      if (!step || !actor.permissions.includes(step.requiredPermission)) {
        throw new ForbiddenException('Commenting on this step requires the step permission');
      }
      if (!comment) throw new BadRequestException('Comment text is required');
      await this.recordAction(inst.id, inst.currentStepSequence, 'COMMENT', actor.userId, comment);
      return {
        instanceId: inst.id,
        status: 'IN_PROGRESS',
        currentStepSequence: inst.currentStepSequence,
      };
    }

    const result = resolveAction(
      inst.definition.steps,
      inst.currentStepSequence,
      action,
      actor.permissions,
    );
    if (result.outcome === 'ERROR') throw new ForbiddenException(result.error);
    if (action === 'REJECT' && !comment) {
      throw new BadRequestException('A rejection reason (comment) is required');
    }

    await this.recordAction(inst.id, inst.currentStepSequence, action, actor.userId, comment);

    let status: WorkflowResult['status'] = 'IN_PROGRESS';
    let nextStep = inst.currentStepSequence;
    if (result.outcome === 'COMPLETED') {
      status = 'APPROVED';
      await this.prisma.workflowInstance.update({
        where: { id: inst.id },
        data: { status: 'APPROVED', completedAt: new Date() },
      });
    } else if (result.outcome === 'REJECTED') {
      status = 'REJECTED';
      await this.prisma.workflowInstance.update({
        where: { id: inst.id },
        data: { status: 'REJECTED', completedAt: new Date() },
      });
    } else {
      nextStep = result.nextStepSequence ?? inst.currentStepSequence;
      await this.prisma.workflowInstance.update({
        where: { id: inst.id },
        data: { currentStepSequence: nextStep },
      });
    }

    await this.audit.log({
      userId: actor.userId,
      action: action === 'REJECT' ? 'REJECT' : 'APPROVE',
      module: 'workflow',
      entityType: 'WorkflowInstance',
      entityId: inst.id,
      newValue: { action, outcome: result.outcome, step: inst.currentStepSequence, comment: comment ?? null },
    });

    return { instanceId: inst.id, status, currentStepSequence: nextStep };
  }

  async getInstance(instanceId: string) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        definition: { include: { steps: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    return instance;
  }

  /** Instances whose current step is actionable by the given user (FRS-014 inbox). */
  async myTasks(permissions: string[], limit = 50) {
    const instances = (await this.prisma.workflowInstance.findMany({
      where: { status: 'IN_PROGRESS' },
      include: { definition: { include: { steps: true } } },
      orderBy: { startedAt: 'asc' },
      take: 500,
    })) as {
      id: string;
      definitionKey: string;
      entityType: string;
      entityId: string;
      currentStepSequence: number;
      startedAt: Date;
      definition: { name: string; steps: StepDefLike[] };
    }[];
    return instances
      .filter((i) => {
        const step = i.definition.steps.find((s) => s.sequence === i.currentStepSequence);
        return step && permissions.includes(step.requiredPermission);
      })
      .slice(0, limit)
      .map((i) => ({
        instanceId: i.id,
        workflow: i.definition.name,
        definitionKey: i.definitionKey,
        entityType: i.entityType,
        entityId: i.entityId,
        step: i.definition.steps.find((s) => s.sequence === i.currentStepSequence)?.name,
        stepSequence: i.currentStepSequence,
        waitingSince: i.startedAt,
      }));
  }

  private async recordAction(
    instanceId: string,
    stepSequence: number,
    action: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT',
    actorId: string,
    comment?: string,
  ): Promise<void> {
    await this.prisma.workflowAction.create({
      data: { instanceId, stepSequence, action, actorId, comment },
    });
  }
}
