import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async getSetting(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting '${key}' not found`);
    return setting;
  }

  async upsertSetting(
    key: string,
    value: Prisma.InputJsonValue,
    description: string | undefined,
    actorId: string,
  ) {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    const setting = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value, description, updatedBy: actorId },
      update: { value, description, updatedBy: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'configuration',
      entityType: 'Setting',
      entityId: key,
      oldValue: existing ? { value: existing.value as Prisma.InputJsonValue } : undefined,
      newValue: { value },
    });
    return setting;
  }

  findAllFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async setFlag(key: string, enabled: boolean, description: string | undefined, actorId: string) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description },
      update: { enabled, ...(description !== undefined ? { description } : {}) },
    });
    await this.audit.log({
      userId: actorId,
      action: existing ? 'UPDATE' : 'CREATE',
      module: 'configuration',
      entityType: 'FeatureFlag',
      entityId: key,
      oldValue: existing ? { enabled: existing.enabled } : undefined,
      newValue: { enabled },
    });
    return flag;
  }
}
