import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
/**
 * Declares the permission codes required to access a route, e.g.
 * @RequirePermissions('audit.view'). Enforced by PermissionsGuard (ADR-016).
 */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
