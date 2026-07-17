import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public health endpoints for load balancers and orchestrators.
 * - GET /health        : summary (db reachability)
 * - GET /health/live   : liveness — process is up
 * - GET /health/ready  : readiness — dependencies reachable (503 when not)
 * Deep diagnostics live under /monitoring (permission-protected, Art. 9.3).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return { status: 'ok', database, timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('live')
  live(): { status: string } {
    return { status: 'alive' };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ready' };
  }
}
