import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { PasswordResetRedisAdapter } from './password-reset-redis.adapter';

describe('PasswordResetRedisAdapter', () => {
  let adapter: PasswordResetRedisAdapter;
  let mockRedisCacheProvider: {
    set: jest.Mock;
    get: jest.Mock;
    getClient: jest.Mock;
  };
  let mockClient: {
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockClient = {
      del: jest.fn().mockResolvedValue(1),
    };

    mockRedisCacheProvider = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetRedisAdapter,
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
      ],
    }).compile();

    adapter = module.get<PasswordResetRedisAdapter>(PasswordResetRedisAdapter);
  });

  it('should save challenge data to redis cache', async () => {
    await adapter.saveChallenge('ch-1', {
      tenantCode: 'tenant-1',
      userId: 'user-1',
      hashedCode: 'hashed',
      codeVerified: false,
    });

    expect(mockRedisCacheProvider.set).toHaveBeenCalledWith(
      'auth:password-reset:{tenant-1:user-1}:ch-1',
      JSON.stringify({
        tenantCode: 'tenant-1',
        userId: 'user-1',
        hashedCode: 'hashed',
        codeVerified: false,
        attempts: 0,
      }),
      900,
    );
  });

  it('should get challenge data from redis cache', async () => {
    const data = {
      tenantCode: 'tenant-1',
      userId: 'user-1',
      hashedCode: 'hashed',
      codeVerified: false,
      attempts: 0,
    };
    mockRedisCacheProvider.get.mockResolvedValue(JSON.stringify(data));

    const res = await adapter.getChallenge('ch-1', 'tenant-1', 'user-1');
    expect(res).toEqual(data);
  });

  it('should return null if challenge not found', async () => {
    mockRedisCacheProvider.get.mockResolvedValue(null);

    const res = await adapter.getChallenge('ch-1', 'tenant-1', 'user-1');
    expect(res).toBeNull();
  });

  it('should increment attempts counter', async () => {
    const data = {
      tenantCode: 'tenant-1',
      userId: 'user-1',
      hashedCode: 'hashed',
      codeVerified: false,
      attempts: 1,
    };
    mockRedisCacheProvider.get.mockResolvedValue(JSON.stringify(data));

    const attempts = await adapter.incrementAttempts('ch-1', 'tenant-1', 'user-1');
    expect(attempts).toBe(2);
    expect(mockRedisCacheProvider.set).toHaveBeenCalled();
  });

  it('should mark code as verified with reset token', async () => {
    const data = {
      tenantCode: 'tenant-1',
      userId: 'user-1',
      hashedCode: 'hashed',
      codeVerified: false,
      attempts: 0,
    };
    mockRedisCacheProvider.get.mockResolvedValue(JSON.stringify(data));

    await adapter.markCodeVerified('ch-1', 'tenant-1', 'user-1', 'token-123');
    expect(mockRedisCacheProvider.set).toHaveBeenCalledWith(
      'auth:password-reset:{tenant-1:user-1}:ch-1',
      expect.stringContaining('"codeVerified":true'),
      900,
    );
  });

  it('should delete challenge from redis', async () => {
    await adapter.deleteChallenge('ch-1', 'tenant-1', 'user-1');
    expect(mockClient.del).toHaveBeenCalledWith('auth:password-reset:{tenant-1:user-1}:ch-1');
  });
});
