import { RedisCacheProvider } from '@new-hros/libs-core';
import Redis from 'ioredis';

import { IpLockoutRedisAdapter } from './ip-lockout-redis.adapter';

describe('IpLockoutRedisAdapter', () => {
  let adapter: IpLockoutRedisAdapter;
  let redisClientMock: jest.Mocked<Partial<Redis>>;
  let redisCacheProviderMock: Partial<RedisCacheProvider>;

  beforeEach(() => {
    redisClientMock = {
      incr: jest.fn() as unknown as Redis['incr'],
      expire: jest.fn() as unknown as Redis['expire'],
      get: jest.fn() as unknown as Redis['get'],
      del: jest.fn() as unknown as Redis['del'],
    };
    redisCacheProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock) as unknown as () => Redis,
    };
    adapter = new IpLockoutRedisAdapter(redisCacheProviderMock as RedisCacheProvider);
  });

  it('should generate correct Redis key format', () => {
    expect(adapter.getKey('TENANT1', 'USR1')).toBe('auth:ip-failure:TENANT1:USR1');
  });

  it('should increment counter and set TTL on first failure', async () => {
    (redisClientMock.incr as jest.Mock).mockResolvedValue(1);
    const count = await adapter.incrementIpFailureCounter('TENANT1', 'USR1');
    expect(count).toBe(1);
    expect(redisClientMock.incr).toHaveBeenCalledWith('auth:ip-failure:TENANT1:USR1');
    expect(redisClientMock.expire).toHaveBeenCalledWith('auth:ip-failure:TENANT1:USR1', 3600);
  });

  it('should increment counter without resetting TTL on subsequent failures', async () => {
    (redisClientMock.incr as jest.Mock).mockResolvedValue(2);
    const count = await adapter.incrementIpFailureCounter('TENANT1', 'USR1');
    expect(count).toBe(2);
    expect(redisClientMock.expire).not.toHaveBeenCalled();
  });
});
