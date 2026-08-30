import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthorizationGuard } from './authorization.guard';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';
import { CumulativeAccessEvaluator } from '../services/cumulative-access-evaluator.service';
import { UserAuthorizationCacheService } from '../services/user-authorization-cache.service';

describe('AuthorizationGuard', () => {
  let guard: AuthorizationGuard;
  let reflector: Reflector;
  let userAuthCacheService: Partial<UserAuthorizationCacheService>;
  let roleCacheService: Partial<RoleCacheService>;
  let roleRepo: Partial<RoleRepository>;
  let evaluator: Partial<CumulativeAccessEvaluator>;

  const tenantCode = 'tenant-guard';
  const userId = 'user-guard';

  beforeEach(async () => {
    reflector = new Reflector();
    userAuthCacheService = {
      getUserAuthorizationProfile: jest.fn(),
    };
    roleCacheService = {
      getRole: jest.fn(),
    };
    roleRepo = {
      findByIdAndTenant: jest.fn(),
    };
    evaluator = {
      evaluateAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationGuard,
        { provide: Reflector, useValue: reflector },
        { provide: UserAuthorizationCacheService, useValue: userAuthCacheService },
        { provide: RoleCacheService, useValue: roleCacheService },
        { provide: RoleRepository, useValue: roleRepo },
        { provide: CumulativeAccessEvaluator, useValue: evaluator },
      ],
    }).compile();

    guard = module.get<AuthorizationGuard>(AuthorizationGuard);
  });

  const createMockContext = (
    req: Record<string, unknown>,
    permissions?: string[],
  ): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should allow immediately if no permissions are required', async () => {
    const context = createMockContext({}, undefined);
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user has zero roles', async () => {
    const context = createMockContext({ tenantCode, user: { id: userId, tenantCode } }, [
      'employee.view',
    ]);
    userAuthCacheService.getUserAuthorizationProfile = jest.fn().mockResolvedValue({
      version: 1,
      roles: [],
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ServiceUnavailableException if cache throws store error', async () => {
    const context = createMockContext({ tenantCode, user: { id: userId, tenantCode } }, [
      'employee.view',
    ]);
    userAuthCacheService.getUserAuthorizationProfile = jest
      .fn()
      .mockRejectedValue(new Error('Redis is down'));

    await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);
  });

  it('should allow access when CumulativeAccessEvaluator returns true', async () => {
    const context = createMockContext(
      {
        tenantCode,
        user: { id: userId, tenantCode },
        params: { employeeId: userId },
      },
      ['employee.view'],
    );

    userAuthCacheService.getUserAuthorizationProfile = jest.fn().mockResolvedValue({
      version: 2,
      roles: [{ roleId: 'role-1', scope: { type: 'SELF', refId: null }, sourceGroupId: 'g-1' }],
    });

    roleCacheService.getRole = jest.fn().mockResolvedValue({
      permissions: [{ code: 'employee.view', isProtected: false }],
    });

    evaluator.evaluateAccess = jest.fn().mockReturnValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(evaluator.evaluateAccess).toHaveBeenCalled();
  });

  it('should deny with ForbiddenException when CumulativeAccessEvaluator returns false', async () => {
    const context = createMockContext(
      {
        tenantCode,
        user: { id: userId, tenantCode },
        params: { employeeId: 'peer-id' },
      },
      ['employee.view'],
    );

    userAuthCacheService.getUserAuthorizationProfile = jest.fn().mockResolvedValue({
      version: 2,
      roles: [{ roleId: 'role-1', scope: { type: 'SELF', refId: null }, sourceGroupId: 'g-1' }],
    });

    roleCacheService.getRole = jest.fn().mockResolvedValue({
      permissions: [{ code: 'employee.view', isProtected: false }],
    });

    evaluator.evaluateAccess = jest.fn().mockReturnValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
