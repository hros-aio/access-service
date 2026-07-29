import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';

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
      client: mockRedisClient,
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
        `auth:user-sessions:${tenantCode}:${userId}`,
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'auth:session:sid-1',
        'auth:session:sid-2',
        `auth:user-sessions:${tenantCode}:${userId}`,
      );
    });

    it('should not call del if no sessions exist in user-sessions set', async () => {
      const tenantCode = 'TENANT1';
      const userId = 'user-uuid-1';

      mockRedisClient.smembers.mockResolvedValue([]);

      await service.revokeAllSessions(tenantCode, userId);

      expect(mockRedisClient.smembers).toHaveBeenCalledWith(
        `auth:user-sessions:${tenantCode}:${userId}`,
      );
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should exit early if redis client is not initialized', async () => {
      const mockRedisCacheProvider = {
        client: null,
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
