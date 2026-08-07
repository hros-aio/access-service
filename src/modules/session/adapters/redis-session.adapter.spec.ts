import Redis from 'ioredis';

import { RedisSessionAdapter } from './redis-session.adapter';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';

describe('RedisSessionAdapter', () => {
  let adapter: RedisSessionAdapter;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    adapter = new RedisSessionAdapter(mockRedis);
  });

  describe('deleteSession', () => {
    it('should execute single session deletion Lua script with correct hash tag keys', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const count = await adapter.deleteSession('TENANT_A', 'usr-123', 'sess-456');

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("DEL", KEYS[1])'),
        2,
        GenerateSessionKey('sess-456'),
        GenerateUserSessionsKey('TENANT_A', 'usr-123', { useHashTag: true }),
        'sess-456',
      );
      expect(count).toBe(1);
    });

    it('should throw error if redis eval fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection lost'));

      await expect(adapter.deleteSession('TENANT_A', 'usr-123', 'sess-456')).rejects.toThrow(
        'Redis connection lost',
      );
    });
  });

  describe('purgeAllUserSessions', () => {
    it('should execute purge all sessions Lua script returning total deleted count', async () => {
      mockRedis.eval.mockResolvedValue(3);

      const count = await adapter.purgeAllUserSessions('TENANT_A', 'usr-123');

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('SMEMBERS'),
        1,
        GenerateUserSessionsKey('TENANT_A', 'usr-123', { useHashTag: true }),
        GenerateSessionKey(''),
      );
      expect(count).toBe(3);
    });
  });
});
