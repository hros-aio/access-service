/* eslint-disable @typescript-eslint/no-explicit-any */
import { IpLockoutRedisAdapter } from './ip-lockout-redis.adapter';

describe('IpLockoutRedisAdapter', () => {
  let adapter: IpLockoutRedisAdapter;
  let redisClientMock: any;
  let redisCacheProviderMock: any;

  beforeEach(() => {
    redisClientMock = {
      incr: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    redisCacheProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };
    adapter = new IpLockoutRedisAdapter(redisCacheProviderMock);
  });

  it('should generate correct Redis key format', () => {
    expect(adapter.getKey('TENANT1', 'USR1')).toBe('auth:ip-failure:TENANT1:USR1');
  });

  it('should increment counter and set TTL on first failure', async () => {
    redisClientMock.incr.mockResolvedValue(1);
    const count = await adapter.incrementIpFailureCounter('TENANT1', 'USR1');
    expect(count).toBe(1);
    expect(redisClientMock.incr).toHaveBeenCalledWith('auth:ip-failure:TENANT1:USR1');
    expect(redisClientMock.expire).toHaveBeenCalledWith('auth:ip-failure:TENANT1:USR1', 3600);
  });

  it('should increment counter without resetting TTL on subsequent failures', async () => {
    redisClientMock.incr.mockResolvedValue(2);
    const count = await adapter.incrementIpFailureCounter('TENANT1', 'USR1');
    expect(count).toBe(2);
    expect(redisClientMock.expire).not.toHaveBeenCalled();
  });
});
