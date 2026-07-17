import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MonitoringService } from './monitoring.service';

/**
 * Operational monitoring endpoints (Art. 9.3). Permission-protected — these
 * are internal diagnostics, never public. Liveness/readiness live under
 * /health (public, unauthenticated) for orchestrators.
 */
@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get()
  @RequirePermissions('monitoring.view')
  full() {
    return this.monitoring.full();
  }

  @Get('queues')
  @RequirePermissions('monitoring.view')
  queues() {
    return this.monitoring.queueHealth();
  }

  @Get('database')
  @RequirePermissions('monitoring.view')
  database() {
    return this.monitoring.databaseLatency();
  }

  @Get('delivery-failures')
  @RequirePermissions('monitoring.view')
  deliveryFailures(@Query('limit') limit?: string) {
    return this.monitoring.recentDeliveryFailures(limit ? Number(limit) : undefined);
  }
}
