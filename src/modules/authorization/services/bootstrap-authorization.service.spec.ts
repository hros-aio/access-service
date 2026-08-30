import { Test, TestingModule } from '@nestjs/testing';

import { BootstrapAuthorizationService } from './bootstrap-authorization.service';
import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { PermissionCatalogService } from '../../permissions/services/permission-catalog.service';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';

describe('BootstrapAuthorizationService', () => {
  let service: BootstrapAuthorizationService;
  let userAuthCacheService: Partial<UserAuthorizationCacheService>;
  let roleCacheService: Partial<RoleCacheService>;
  let roleRepo: Partial<RoleRepository>;
  let catalogService: Partial<PermissionCatalogService>;

  const tenantCode = 'tenant-boot';
  const userId = 'user-boot';

  beforeEach(async () => {
    userAuthCacheService = {
      getUserAuthorizationProfile: jest.fn(),
    };
    roleCacheService = {
      getRole: jest.fn(),
    };
    roleRepo = {
      findByIdAndTenant: jest.fn(),
    };
    catalogService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BootstrapAuthorizationService,
        { provide: UserAuthorizationCacheService, useValue: userAuthCacheService },
        { provide: RoleCacheService, useValue: roleCacheService },
        { provide: RoleRepository, useValue: roleRepo },
        { provide: PermissionCatalogService, useValue: catalogService },
      ],
    }).compile();

    service = module.get<BootstrapAuthorizationService>(BootstrapAuthorizationService);
  });

  it('should return cumulative deduplicated permissions, modules, and version', async () => {
    userAuthCacheService.getUserAuthorizationProfile = jest.fn().mockResolvedValue({
      version: 4,
      roles: [
        { roleId: 'role-1', scope: { type: 'SELF', refId: null }, sourceGroupId: 'g-1' },
        {
          roleId: 'role-2',
          scope: { type: 'DIRECT_REPORTEES', refId: null },
          sourceGroupId: 'g-2',
        },
      ],
    });

    roleCacheService.getRole = jest.fn().mockImplementation((_tenant: string, roleId: string) => {
      if (roleId === 'role-1') {
        return Promise.resolve({
          name: 'Employee',
          permissions: [{ code: 'employee.view' }, { code: 'leave.apply' }],
        });
      }
      if (roleId === 'role-2') {
        return Promise.resolve({
          name: 'Manager',
          permissions: [{ code: 'employee.view' }, { code: 'leave.approve' }],
        });
      }
      return Promise.resolve(null);
    });

    const result = await service.getBootstrapCapabilities(tenantCode, userId);

    expect(result.authorizationVersion).toBe(4);
    expect(result.permissions.sort()).toEqual(
      ['employee.view', 'leave.apply', 'leave.approve'].sort(),
    );
    expect(result.roles.sort()).toEqual(['Employee', 'Manager'].sort());
    expect(result.modules.sort()).toEqual(['employee', 'leave'].sort());
  });

  it('should return empty lists when user has zero roles', async () => {
    userAuthCacheService.getUserAuthorizationProfile = jest.fn().mockResolvedValue({
      version: 1,
      roles: [],
    });

    const result = await service.getBootstrapCapabilities(tenantCode, userId);

    expect(result.authorizationVersion).toBe(1);
    expect(result.permissions).toEqual([]);
    expect(result.modules).toEqual([]);
    expect(result.roles).toEqual([]);
  });
});
