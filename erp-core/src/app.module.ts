import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CrmModule } from './modules/crm/crm.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DonationsModule } from './modules/donations/donations.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { MedicalModule } from './modules/medical/medical.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';
import { CmsModule } from './modules/cms/cms.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotificationModule } from './modules/notification/notification.module';
import { JwtAuthGuard } from './modules/identity/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/authorization/guards/permissions.guard';

function redisConnection(config: ConfigService): { host: string; port: number; password?: string } {
  const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: url.password } : {}),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_SECONDS', 60)) * 1000,
            limit: Number(config.get('THROTTLE_LIMIT', 100)),
          },
        ],
      }),
    }),
    // BullMQ root connection (ADR-008): all background work runs through queues.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: redisConnection(config) }),
    }),
    PrismaModule,
    HealthModule,
    // Phase 1 (Build Spec Part 4 §3)
    AuditModule,
    IdentityModule,
    AuthorizationModule,
    ConfigurationModule,
    // Phase 2 - Core Business Foundation (Build Spec Part 7 §6)
    CrmModule,
    StorageModule,
    NotificationModule,
    // Phase 3 - Financial Core (ADR-011/019/020)
    FinanceModule,
    // Phase 4 - Donations & Campaigns (ADR-021) — ERP v1.0 MVP heart
    DonationsModule,
    // Phase 5A - Subscriptions & Baqiyat Al-Salihat (FRS-004)
    SubscriptionsModule,
    // Phase 6 - Workflow Engine (ADR-015) + Programs & Services
    WorkflowModule,
    MedicalModule,
    ProjectsModule,
    VolunteersModule,
    // Phase 7 - CMS & Communication Center (FRS-009/010)
    CommunicationModule,
    CmsModule,
    // Phase 8 - Analytics & Executive Dashboard (FRS-013)
    AnalyticsModule,
    // Production hardening - operational monitoring (Art. 9.3)
    MonitoringModule,
  ],
  providers: [
    // Order matters: throttling → authentication → authorization
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
