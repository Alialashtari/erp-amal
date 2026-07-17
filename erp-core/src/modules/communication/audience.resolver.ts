import { Injectable } from '@nestjs/common';
import { AudienceType, PersonRoleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves a message audience (FRS-009) to concrete recipient user ids.
 * Recipients are login accounts (users): only they hold addresses/devices.
 * Persons without accounts are reachable via person-directed sends, not bulk
 * audiences (v1 scope).
 */
@Injectable()
export class AudienceResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUserIds(
    audience: AudienceType,
    filter?: Record<string, unknown> | null,
  ): Promise<string[]> {
    switch (audience) {
      case 'ALL_USERS': {
        const users = await this.prisma.user.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });
        return (users as { id: string }[]).map((u) => u.id);
      }
      case 'ROLE': {
        const roleName = filter?.roleName as string | undefined;
        if (!roleName) return [];
        const assignments = await this.prisma.userRole.findMany({
          where: { role: { name: roleName }, user: { status: 'ACTIVE' } },
          select: { userId: true },
        });
        return [...new Set((assignments as { userId: string }[]).map((a) => a.userId))];
      }
      case 'DONORS':
        return this.usersForPersonRole('DONOR');
      case 'VOLUNTEERS':
        return this.usersForPersonRole('VOLUNTEER');
      case 'SUBSCRIBERS': {
        const subs = await this.prisma.subscription.findMany({
          where: { status: 'ACTIVE' },
          select: { personId: true },
        });
        return this.usersForPersonIds((subs as { personId: string }[]).map((s) => s.personId));
      }
      default:
        return [];
    }
  }

  private async usersForPersonRole(roleType: PersonRoleType): Promise<string[]> {
    const roles = await this.prisma.personRole.findMany({
      where: { roleType, active: true },
      select: { personId: true },
    });
    return this.usersForPersonIds((roles as { personId: string }[]).map((r) => r.personId));
  }

  private async usersForPersonIds(personIds: string[]): Promise<string[]> {
    if (personIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { personId: { in: [...new Set(personIds)] }, status: 'ACTIVE' },
      select: { id: true },
    });
    return (users as { id: string }[]).map((u) => u.id);
  }
}
