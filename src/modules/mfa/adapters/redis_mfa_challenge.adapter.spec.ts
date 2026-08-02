import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { RedisMfaChallengeAdapter } from './redis_mfa_challenge.adapter';

describe('RedisMfaChallengeAdapter', () => {
  let adapter: RedisMfaChallengeAdapter;
  let redisCacheProvider: Record<string, jest.Mock>;
  let mockRedisClient: { del: jest.Mock };

  beforeEach(async () => {
    mockRedisClient = {
      del: jest.fn(),
    };
    redisCacheProvider = {
      set: jest.fn(),
      get: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisMfaChallengeAdapter,
        { provide: RedisCacheProvider, useValue: redisCacheProvider },
      ],
    }).compile();

    adapter = module.get<RedisMfaChallengeAdapter>(RedisMfaChallengeAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should save challenge to redis cache with 300s TTL', async () => {
    const data = {
      challengeId: 'ch-123',
      tenantCode: 't-1',
      userId: 'u-1',
      factorType: 'totp',
      codeHash: 'hash',
      attemptsLeft: 5,
    };

    await adapter.saveChallenge(data);

    expect(redisCacheProvider.set).toHaveBeenCalledWith(
      'auth:mfa-challenge:t-1:u-1:ch-123',
      JSON.stringify(data),
      300,
    );
  });

  it('should return challenge object on lookup', async () => {
    const data = {
      challengeId: 'ch-123',
      tenantCode: 't-1',
      userId: 'u-1',
      factorType: 'totp',
      codeHash: 'hash',
      attemptsLeft: 5,
    };
    redisCacheProvider.get.mockResolvedValue(JSON.stringify(data));

    const result = await adapter.getChallenge('t-1', 'u-1', 'ch-123');

    expect(result).toEqual(data);
  });

  it('should decrement attempts and delete key when 0 attempts remaining', async () => {
    const data = {
      challengeId: 'ch-123',
      tenantCode: 't-1',
      userId: 'u-1',
      factorType: 'totp',
      codeHash: 'hash',
      attemptsLeft: 1,
    };

    const remaining = await adapter.decrementAttempts(data);

    expect(remaining).toBe(0);
    expect(mockRedisClient.del).toHaveBeenCalledWith('auth:mfa-challenge:t-1:u-1:ch-123');
  });

  it('should decrement attempts and update redis when attempts > 0', async () => {
    const data = {
      challengeId: 'ch-123',
      tenantCode: 't-1',
      userId: 'u-1',
      factorType: 'totp',
      codeHash: 'hash',
      attemptsLeft: 3,
    };

    const remaining = await adapter.decrementAttempts(data);

    expect(remaining).toBe(2);
    expect(redisCacheProvider.set).toHaveBeenCalled();
  });

  it('should throw ServiceUnavailableException on save error', async () => {
    redisCacheProvider.set.mockRejectedValue(new Error('Redis error'));
    await expect(
      adapter.saveChallenge({
        challengeId: 'ch-1',
        tenantCode: 't-1',
        userId: 'u-1',
        factorType: 'totp',
        codeHash: 'hash',
        attemptsLeft: 5,
      }),
    ).rejects.toThrow('AUTH_STORE_UNAVAILABLE');
  });

  it('should throw ServiceUnavailableException on get error', async () => {
    redisCacheProvider.get.mockRejectedValue(new Error('Redis error'));
    await expect(adapter.getChallenge('t-1', 'u-1', 'ch-1')).rejects.toThrow(
      'AUTH_STORE_UNAVAILABLE',
    );
  });

  it('should throw ServiceUnavailableException on decrement error', async () => {
    redisCacheProvider.set.mockRejectedValue(new Error('Redis error'));
    await expect(
      adapter.decrementAttempts({
        challengeId: 'ch-1',
        tenantCode: 't-1',
        userId: 'u-1',
        factorType: 'totp',
        codeHash: 'hash',
        attemptsLeft: 2,
      }),
    ).rejects.toThrow('AUTH_STORE_UNAVAILABLE');
  });
});
