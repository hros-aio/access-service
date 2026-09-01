import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_PROVIDER_TOKEN } from '@new-hros/libs-core';

import { RoleCacheService } from './role-cache.service';
import { Role } from '../entities/role.entity';

describe('RoleCacheService', () => {
  let service: RoleCacheService;
  let mockCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleCacheService,
        {
          provide: CACHE_PROVIDER_TOKEN,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<RoleCacheService>(RoleCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncRole', () => {
    it('should set role in cacheService with TTL', async () => {
      const role = {
        id: 'role-1',
        tenantCode: 'tenant-1',
        name: 'Admin',
        type: 'CUSTOM',
        systemRoleKey: null,
        status: 'ACTIVE',
        version: 1,
        permissions: [
          { permissionCode: 'employee.view', isProtected: false },
          { permissionCode: 'employee.edit', isProtected: true },
        ],
      } as unknown as Role;

      await service.syncRole(role);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'authz:role:tenant-1:role-1',
        expect.objectContaining({
          roleId: 'role-1',
          tenantCode: 'tenant-1',
          name: 'Admin',
          permissions: [
            { code: 'employee.view', isProtected: false },
            { code: 'employee.edit', isProtected: true },
          ],
        }),
        86400,
      );
    });
  });

  describe('getRole', () => {
    it('should return null if cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.getRole('tenant-1', 'role-1');
      expect(result).toBeNull();
      expect(mockCacheService.get).toHaveBeenCalledWith('authz:role:tenant-1:role-1');
    });

    it('should return cached object from cacheService', async () => {
      const data = { roleId: 'role-1', name: 'Admin' };
      mockCacheService.get.mockResolvedValue(data);

      const result = await service.getRole('tenant-1', 'role-1');
      expect(result).toEqual(data);
      expect(mockCacheService.get).toHaveBeenCalledWith('authz:role:tenant-1:role-1');
    });
  });

  describe('invalidateRole', () => {
    it('should call cacheService.del', async () => {
      await service.invalidateRole('tenant-1', 'role-1');
      expect(mockCacheService.del).toHaveBeenCalledWith('authz:role:tenant-1:role-1');
    });
  });
});
