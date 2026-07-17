import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

function contextWith(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (permission tests, Constitution Art. 10)', () => {
  const user: AuthenticatedUser = {
    userId: 'u1',
    sessionId: 's1',
    roles: ['financial_manager'],
    permissions: ['audit.view', 'configuration.view'],
  };

  function guardRequiring(required: string[] | undefined): PermissionsGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('allows routes without permission requirements', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(user))).toBe(true);
  });

  it('allows when the user holds every required permission', () => {
    expect(guardRequiring(['audit.view']).canActivate(contextWith(user))).toBe(true);
  });

  it('denies when any required permission is missing', () => {
    expect(() => guardRequiring(['authorization.manage']).canActivate(contextWith(user))).toThrow(
      ForbiddenException,
    );
  });

  it('denies unauthenticated requests on protected routes', () => {
    expect(guardRequiring(['audit.view']).canActivate(contextWith(undefined))).toBe(false);
  });
});
