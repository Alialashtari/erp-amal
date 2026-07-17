import { Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from './auth.service';

/**
 * Administrative user-account management (FRS: activate, disable, lock, archive).
 * No hard delete exists (Constitution Art. 4.4).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        take,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          status: true,
          personId: true,
          lastLoginAt: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
      this.prisma.user.count(),
    ]);
    type LoadedUser = Record<string, unknown> & { roles: { role: { name: string } }[] };
    return {
      items: (items as LoadedUser[]).map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) })),
      total,
      limit: take,
      offset,
    };
  }

  /** Links a login account to its CRM Person (Phase 2: User.personId is a real FK). */
  async linkPerson(userId: string, personId: string, actorId: string, meta: RequestMeta) {
    const [user, person] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.person.findUnique({ where: { id: personId }, select: { id: true, status: true } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!person) throw new NotFoundException('Person not found');
    if ((person as { status: string }).status === 'MERGED') {
      throw new NotFoundException('Cannot link to a merged person; use the primary profile');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { personId },
      select: { id: true, personId: true },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'identity',
      entityType: 'User',
      entityId: userId,
      oldValue: { personId: user.personId },
      newValue: { personId },
      ...meta,
    });
    return updated;
  }

  async setStatus(
    userId: string,
    status: UserStatus,
    actorId: string,
    meta: RequestMeta,
  ): Promise<{ id: string; status: UserStatus }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status } });

    // Disabling/locking/archiving revokes all active sessions immediately.
    if (status !== 'ACTIVE') {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'identity',
      entityType: 'User',
      entityId: userId,
      oldValue: { status: user.status },
      newValue: { status },
      ...meta,
    });

    return { id: updated.id, status: updated.status };
  }
}
