import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertTemplateDto } from './dto/upsert-template.dto';

@ApiTags('notification')
@ApiBearerAuth()
@Controller('notifications/templates')
export class TemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('notification.view')
  findAll() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  @Put(':key')
  @RequirePermissions('notification.manage')
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { key } });
    const template = await this.prisma.notificationTemplate.upsert({
      where: { key },
      create: { key, ...dto, updatedBy: user.userId },
      update: { ...dto, updatedBy: user.userId },
    });
    await this.audit.log({
      userId: user.userId,
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'notification',
      entityType: 'NotificationTemplate',
      entityId: key,
      newValue: { channel: dto.channel, active: dto.active ?? true },
    });
    return template;
  }
}
