import { Test, TestingModule } from '@nestjs/testing';
import { CacheService, RedisCacheProvider } from '@new-hros/libs-core';

import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { UserEffectiveRoleEntity } from '../entities/user-effective-role.entity';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

describe('UserAuthorizationCacheService', () => {
  let service: UserAuthorizationCacheService;
  let redisMock: Record<string, jest.Mock>;
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let repoMock: Partial<UserEffectiveRoleRepository>;

  const tenantCode = 'tenant-1';
  const userId = 'user-1';

  beforeEach(async () => {
    redisMock = {
      incr: jest.fn().mockResolvedValue(5),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    repoMock = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'row-1',
          tenantCode,
          userId,
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
          provide: CacheService,
          useValue: cacheServiceMock,
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
    expect(cacheServiceMock.set).toHaveBeenCalledWith(
      `authz:user:${tenantCode}:${userId}`,
      {
        version: 5,
        roles: [
          {
            roleId: 'role-1',
            sourceGroupId: 'group-1',
            scope: {
              type: 'SELF',
              refId: null,
            },
          },
        ],
      },
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
    cacheServiceMock.get.mockResolvedValueOnce(cachedProfile);

    const result = await service.getUserAuthorizationProfile(tenantCode, userId);

    expect(result).toEqual(cachedProfile);
    expect(repoMock.find).not.toHaveBeenCalled();
  });

  it('should recover from repository on cache miss', async () => {
    cacheServiceMock.get.mockResolvedValueOnce(null);

    const result = await service.getUserAuthorizationProfile(tenantCode, userId);

    expect(repoMock.find).toHaveBeenCalledWith({ userId });
    expect(result.roles).toHaveLength(1);
  });

  it('should store empty roles array for zero-group user', async () => {
    repoMock.find = jest.fn().mockResolvedValueOnce([]);

    const result = await service.syncUserCache(tenantCode, userId);

    expect(result.roles).toEqual([]);
    expect(cacheServiceMock.set).toHaveBeenCalledWith(
      `authz:user:${tenantCode}:${userId}`,
      { version: 5, roles: [] },
      86400,
    );
  });
});
