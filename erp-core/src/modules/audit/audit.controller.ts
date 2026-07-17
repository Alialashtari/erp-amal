import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Read-only audit trail. No mutation endpoints exist by design. */
  @Get('logs')
  @RequirePermissions('audit.view')
  async findLogs(@Query() query: QueryAuditDto) {
    const where = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }
}
