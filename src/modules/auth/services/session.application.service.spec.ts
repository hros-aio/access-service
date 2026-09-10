import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_KEY_BUILDER, RedisCacheProvider } from '@new-hros/libs-core';

import { SessionApplicationService } from './session.application.service';

describe('SessionApplicationService', () => {
  let service: SessionApplicationService;
  let mockRedisClient: { smembers: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    mockRedisClient = {
      smembers: jest.fn(),
      del: jest.fn(),
    };

    const mockRedisCacheProvider = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionApplicationService,
        {
          provide: RedisCacheProvider,
          useValue: mockRedisCacheProvider,
        },
      ],
    }).compile();

    service = module.get<SessionApplicationService>(SessionApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revokeAllSessions', () => {
    it('should revoke sessions if session IDs exist in user-sessions set', async () => {
      const tenantCode = 'TENANT1';
      const userId = 'user-uuid-1';
      const sessionIds = ['sid-1', 'sid-2'];

      mockRedisClient.smembers.mockResolvedValue(sessionIds);
      mockRedisClient.del.mockResolvedValue(1);

      await service.revokeAllSessions(tenantCode, userId);

      expect(mockRedisClient.smembers).toHaveBeenCalledWith(
        CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId),
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        CACHE_KEY_BUILDER.buildSession('sid-1'),
        CACHE_KEY_BUILDER.buildSession('sid-2'),
        CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId),
      );
    });

    it('should not call del if no sessions exist in user-sessions set', async () => {
      const tenantCode = 'TENANT1';
      const userId = 'user-uuid-1';

      mockRedisClient.smembers.mockResolvedValue([]);

      await service.revokeAllSessions(tenantCode, userId);

      expect(mockRedisClient.smembers).toHaveBeenCalledWith(
        CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId),
      );
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should exit early if redis client is not initialized', async () => {
      const mockRedisCacheProvider = {
        getClient: jest.fn().mockReturnValue(null),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SessionApplicationService,
          {
            provide: RedisCacheProvider,
            useValue: mockRedisCacheProvider,
          },
        ],
      }).compile();

      const localService = module.get<SessionApplicationService>(SessionApplicationService);
      await expect(localService.revokeAllSessions('T1', 'U1')).resolves.not.toThrow();
    });
  });
});
