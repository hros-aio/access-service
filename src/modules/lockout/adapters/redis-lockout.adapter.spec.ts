import { Redis } from 'ioredis';

import { RedisLockoutAdapter } from './redis-lockout.adapter';

describe('RedisLockoutAdapter', () => {
  let adapter: RedisLockoutAdapter;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    adapter = new RedisLockoutAdapter(mockRedis);
  });

  it('should call eval for incrementCredentialFailure with hash tags', async () => {
    mockRedis.eval.mockResolvedValue(1);
    const count = await adapter.incrementCredentialFailure('TENANT_A', 'usr_123', 900);
    expect(count).toBe(1);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'auth:login-failure:{TENANT_A}:usr_123',
      900,
    );
  });

  it('should call eval for incrementIpFailure', async () => {
    mockRedis.eval.mockResolvedValue(3);
    const count = await adapter.incrementIpFailure('TENANT_A', 'usr_123', 900);
    expect(count).toBe(3);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'auth:ip-failure:{TENANT_A}:usr_123',
      900,
    );
  });

  it('should reset credential failure key', async () => {
    await adapter.resetCredentialFailure('TENANT_A', 'usr_123');
    expect(mockRedis.del).toHaveBeenCalledWith('auth:login-failure:{TENANT_A}:usr_123');
  });
});
