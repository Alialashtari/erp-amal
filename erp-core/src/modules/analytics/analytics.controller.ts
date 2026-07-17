import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SnapshotScope } from '@prisma/client';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { SnapshotsService } from './snapshots.service';
import { ReportsService } from './reports.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly snapshots: SnapshotsService,
    private readonly reports: ReportsService,
  ) {}

  /** The full executive dashboard in one call (FRS-013). */
  @Get('dashboard')
  @RequirePermissions('analytics.view')
  dashboard() {
    return this.analytics.fullDashboard();
  }

  @Get('overview')
  @RequirePermissions('analytics.view')
  overview() {
    return this.analytics.executiveOverview();
  }

  @Get('kpis/financial')
  @RequirePermissions('analytics.view')
  financial() {
    return this.analytics.financialKpis();
  }

  @Get('kpis/campaigns')
  @RequirePermissions('analytics.view')
  campaigns(@Query('top') top?: string) {
    return this.analytics.campaignKpis(top ? Number(top) : undefined);
  }

  @Get('kpis/subscriptions')
  @RequirePermissions('analytics.view')
  subscriptions() {
    return this.analytics.subscriptionKpis();
  }

  @Get('kpis/boxes')
  @RequirePermissions('analytics.view')
  boxes() {
    return this.analytics.boxesKpis();
  }

  @Get('kpis/projects')
  @RequirePermissions('analytics.view')
  projects() {
    return this.analytics.projectKpis();
  }

  @Get('kpis/medical')
  @RequirePermissions('analytics.view')
  medical() {
    return this.analytics.medicalKpis();
  }

  @Get('kpis/hr')
  @RequirePermissions('analytics.view')
  hr() {
    return this.analytics.hrKpis();
  }

  @Get('trend/monthly')
  @RequirePermissions('analytics.view')
  monthlyTrend(@Query('months') months?: string) {
    return this.analytics.monthlyTrend(months ? Number(months) : undefined);
  }

  // ── snapshots ──

  @Get('snapshots/:scope')
  @RequirePermissions('analytics.view')
  history(@Param('scope') scopeParam: string, @Query('days') days?: string) {
    const scope = scopeParam.toUpperCase() as SnapshotScope;
    if (!Object.values(SnapshotScope).includes(scope)) {
      throw new BadRequestException(`Unknown scope '${scopeParam}'`);
    }
    return this.snapshots.history(scope, days ? Number(days) : undefined);
  }

  /** Manual capture (normally done by the daily scheduler). */
  @Post('snapshots/capture')
  @RequirePermissions('analytics.manage')
  capture() {
    return this.snapshots.captureDaily();
  }

  // ── reports ──

  @Get('reports/monthly/:year/:month')
  @RequirePermissions('analytics.view')
  monthly(@Param('year', ParseIntPipe) year: number, @Param('month', ParseIntPipe) month: number) {
    return this.reports.monthly(year, month);
  }

  @Get('reports/yearly/:year')
  @RequirePermissions('analytics.view')
  yearly(@Param('year', ParseIntPipe) year: number) {
    return this.reports.yearly(year);
  }

  @Get('reports/custom')
  @RequirePermissions('analytics.export')
  custom(@Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) throw new BadRequestException('from and to are required (ISO dates)');
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return this.reports.custom(fromDate, toDate);
  }
}
