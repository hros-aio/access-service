import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { UserEffectiveRoleEntity } from '../entities/user-effective-role.entity';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

describe('UserAuthorizationCacheService', () => {
  let service: UserAuthorizationCacheService;
  let redisMock: Record<string, jest.Mock>;
  let repoMock: Partial<UserEffectiveRoleRepository>;

  const tenantCode = 'tenant-1';
  const userId = 'user-1';

  beforeEach(async () => {
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(5),
    };

    repoMock = {
      findByEmployee: jest.fn().mockResolvedValue([
        {
          id: 'row-1',
          tenantCode,
          employeeId: userId,
          roleId: 'role-1',
          sourceGroupId: 'group-1',
          scopeType: 'SELF',
          scopeEntityId: null,
          createdAt: new Date(),
        } as UserEffectiveRoleEntity,
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAuthorizationCacheService,
        {
          provide: RedisCacheProvider,
          useValue: { getClient: jest.fn().mockReturnValue(redisMock) },
        },
        {
          provide: UserEffectiveRoleRepository,
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<UserAuthorizationCacheService>(UserAuthorizationCacheService);
  });

  it('should sync user cache and increment version in Redis', async () => {
    const result = await service.syncUserCache(tenantCode, userId);

    expect(result.version).toBe(5);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].roleId).toBe('role-1');
    expect(result.roles[0].scope.type).toBe('SELF');

    expect(redisMock.incr).toHaveBeenCalledWith(`authz:version:${tenantCode}:${userId}`);
    expect(redisMock.set).toHaveBeenCalledWith(
      `authz:user:${tenantCode}:${userId}`,
      expect.stringContaining('"version":5'),
      'EX',
      86400,
    );
  });

  it('should return cached profile on cache hit without reading repository', async () => {
    const cachedProfile = {
      version: 3,
      roles: [
        {
          roleId: 'role-cached',
          scope: { type: 'TENANT' as const, refId: null },
          sourceGroupId: 'g-1',
        },
      ],
    };
    redisMock.get.mockResolvedValueOnce(JSON.stringify(cachedProfile));

    const result = await service.getUserAuthorizationProfile(tenantCode, userId);

    expect(result).toEqual(cachedProfile);
    expect(repoMock.findByEmployee).not.toHaveBeenCalled();
  });

  it('should recover from repository on cache miss', async () => {
    redisMock.get.mockResolvedValueOnce(null);

    const result = await service.getUserAuthorizationProfile(tenantCode, userId);

    expect(repoMock.findByEmployee).toHaveBeenCalledWith(tenantCode, userId);
    expect(result.roles).toHaveLength(1);
  });

  it('should store empty roles array for zero-group user', async () => {
    repoMock.findByEmployee = jest.fn().mockResolvedValueOnce([]);

    const result = await service.syncUserCache(tenantCode, userId);

    expect(result.roles).toEqual([]);
    expect(redisMock.set).toHaveBeenCalledWith(
      `authz:user:${tenantCode}:${userId}`,
      JSON.stringify({ version: 5, roles: [] }),
      'EX',
      86400,
    );
  });
});
