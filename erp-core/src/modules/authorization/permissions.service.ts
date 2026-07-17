import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

/** Resolves a user's effective roles and permission codes (RBAC core). */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserAccess(userId: string): Promise<UserAccess> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            name: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    type LoadedUserRole = {
      role: { name: string; permissions: { permission: { code: string } }[] };
    };
    const loaded = userRoles as LoadedUserRole[];
    const roles = loaded.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(loaded.flatMap((ur) => ur.role.permissions.map((p) => p.permission.code))),
    ];
    return { roles, permissions };
  }
}
