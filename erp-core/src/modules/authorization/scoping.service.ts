import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Canonical scope types (ADR-016). Extend here as future modules need them. */
export const SCOPE_TYPES = {
  GOVERNORATE: 'GOVERNORATE',
  PROJECT: 'PROJECT',
  DEPARTMENT: 'DEPARTMENT',
  ASSIGNMENT: 'ASSIGNMENT',
} as const;
export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];

/**
 * Generalized data-scoping (Phase 6, ADR-016). One place resolves a user's
 * scope rules; each module applies the relevant where-builder server-side.
 * No scope rules of a type = unrestricted for that dimension.
 */
@Injectable()
export class ScopingService {
  constructor(private readonly prisma: PrismaService) {}

  async getScopeValues(userId: string, scopeType: ScopeType): Promise<string[]> {
    const rules = (await this.prisma.scopeRule.findMany({
      where: { userId, scopeType },
      select: { scopeValue: true },
    })) as { scopeValue: string }[];
    return rules.map((r) => r.scopeValue);
  }

  /**
   * Resolves person ids inside the given governorates (for modules that
   * reference persons by id without a Prisma relation, e.g. medical cases).
   * Returns null when unrestricted.
   */
  async personIdsForGovernorates(governorates: string[]): Promise<string[] | null> {
    if (governorates.length === 0) return null;
    const persons = (await this.prisma.person.findMany({
      where: { addresses: { some: { governorate: { in: governorates } } } },
      select: { id: true },
      take: 10000,
    })) as { id: string }[];
    return persons.map((p) => p.id);
  }

  // ── pure where-builders (unit-tested; empty list = no restriction) ──

  /** Persons restricted by address governorate (CRM). */
  static personWhere(governorates: string[]): Record<string, unknown> {
    if (governorates.length === 0) return {};
    return { addresses: { some: { governorate: { in: governorates } } } };
  }

  /** Projects restricted by project id; a manager also sees projects they manage. */
  static projectWhere(projectIds: string[], managerUserId?: string): Record<string, unknown> {
    if (projectIds.length === 0) return {};
    return managerUserId
      ? { OR: [{ id: { in: projectIds } }, { managerId: managerUserId }] }
      : { id: { in: projectIds } };
  }

  /** Teams restricted by department (volunteer supervisors). */
  static teamWhere(departments: string[]): Record<string, unknown> {
    if (departments.length === 0) return {};
    return { department: { in: departments } };
  }

  /** Entities referencing persons by id, restricted to a resolved id set. */
  static personIdWhere(field: string, personIds: string[] | null): Record<string, unknown> {
    if (personIds === null) return {};
    return { [field]: { in: personIds } };
  }
}
