import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Role and assignment management. All permission changes are audited (Art. 6.3). */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  async createRole(name: string, description: string | undefined, actorId: string) {
    const role = await this.prisma.role.create({ data: { name, description } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'authorization',
      entityType: 'Role',
      entityId: role.id,
      newValue: { name, ...(description ? { description } : {}) },
    });
    return role;
  }

  async setRolePermissions(roleId: string, permissionCodes: string[], actorId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && role.name === 'super_admin') {
      throw new BadRequestException('super_admin permissions cannot be modified');
    }

    const permissions = (await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    })) as { id: string; code: string }[];
    const unknown = permissionCodes.filter((c) => !permissions.some((p) => p.code === c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permission codes: ${unknown.join(', ')}`);
    }

    const rolePermissions = role.permissions as { permission: { code: string } }[];
    const oldCodes = rolePermissions.map((rp) => rp.permission.code);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    await this.audit.log({
      userId: actorId,
      action: 'PERMISSION_CHANGE',
      module: 'authorization',
      entityType: 'Role',
      entityId: roleId,
      oldValue: { permissions: oldCodes },
      newValue: { permissions: permissionCodes },
    });

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async assignRole(userId: string, roleId: string, actorId: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!user || !role) throw new NotFoundException('User or role not found');

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    await this.audit.log({
      userId: actorId,
      action: 'PERMISSION_CHANGE',
      module: 'authorization',
      entityType: 'UserRole',
      entityId: userId,
      newValue: { assignedRole: role.name },
    });
    return { userId, roleId, role: role.name };
  }

  async revokeRole(userId: string, roleId: string, actorId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    await this.audit.log({
      userId: actorId,
      action: 'PERMISSION_CHANGE',
      module: 'authorization',
      entityType: 'UserRole',
      entityId: userId,
      oldValue: { revokedRole: role.name },
    });
    return { userId, roleId, revoked: true };
  }
}
