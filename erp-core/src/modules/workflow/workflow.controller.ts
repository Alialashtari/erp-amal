import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from './workflow.service';
import { ActOnInstanceDto } from './dto/act-on-instance.dto';
import { UpsertDefinitionDto } from './dto/upsert-definition.dto';

@ApiTags('workflow')
@ApiBearerAuth()
@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('definitions')
  @RequirePermissions('workflow.view')
  listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { key: 'asc' },
    });
  }

  /** Upsert a definition with its full step list (ADR-015 config-driven). */
  @Put('definitions/:key')
  @RequirePermissions('workflow.manage')
  async upsertDefinition(
    @Param('key') key: string,
    @Body() dto: UpsertDefinitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const definition = await this.prisma.workflowDefinition.upsert({
      where: { key },
      create: {
        key,
        name: dto.name,
        module: dto.module,
        entityType: dto.entityType,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
      update: {
        name: dto.name,
        module: dto.module,
        entityType: dto.entityType,
        description: dto.description,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    // Steps are replaced wholesale; existing instances keep their history intact.
    await this.prisma.$transaction([
      this.prisma.workflowStepDef.deleteMany({ where: { definitionKey: key } }),
      this.prisma.workflowStepDef.createMany({
        data: dto.steps.map((s, i) => ({
          definitionKey: key,
          sequence: i + 1,
          name: s.name,
          requiredPermission: s.requiredPermission,
          slaHours: s.slaHours,
          escalationPermission: s.escalationPermission,
        })),
      }),
    ]);
    await this.audit.log({
      userId: user.userId,
      action: 'UPDATE',
      module: 'workflow',
      entityType: 'WorkflowDefinition',
      entityId: key,
      newValue: { steps: dto.steps.map((s) => s.name) },
    });
    return this.prisma.workflowDefinition.findUnique({
      where: { key },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
  }

  /** Personal approval inbox (FRS-014). Self-scoped; no admin permission needed. */
  @Get('my-tasks')
  myTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.workflow.myTasks(user.permissions);
  }

  @Get('instances/:id')
  @RequirePermissions('workflow.view')
  getInstance(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.getInstance(id);
  }

  /** Act on the current step. Authorization = the step's required permission. */
  @Post('instances/:id/act')
  act(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActOnInstanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflow.act(id, dto.action, dto.comment, user);
  }
}
