import { Injectable, Logger } from '@nestjs/common';
import { CACHE_KEY_BUILDER } from '@new-hros/libs-core';
import Redis from 'ioredis';

@Injectable()
export class RedisSessionAdapter {
  private readonly logger = new Logger(RedisSessionAdapter.name);

  constructor(private readonly redisClient: Redis) {}

  /**
   * Atomically deletes a single session hash and removes its ID from the user session set.
   * Uses cluster hash tags {tenantCode:userId} to ensure slot alignment in Redis Cluster.
   */
  async deleteSession(tenantCode: string, userId: string, sessionId: string): Promise<number> {
    const sessionKey = CACHE_KEY_BUILDER.buildSession(sessionId);
    const userSessionsKey = CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId, {
      useHashTag: true,
    });

    const luaScript = `
      redis.call("DEL", KEYS[1])
      local removed = redis.call("SREM", KEYS[2], ARGV[1])
      return removed
    `;

    try {
      const result = await this.redisClient.eval(
        luaScript,
        2,
        sessionKey,
        userSessionsKey,
        sessionId,
      );
      return Number(result) || 1;
    } catch (error) {
      this.logger.error(
        `Failed to execute deleteSession Lua script for session ${sessionId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Atomically purges all active session hashes for a user and deletes the user session set index.
   * Uses cluster hash tags {tenantCode:userId} to guarantee slot alignment.
   */
  async purgeAllUserSessions(tenantCode: string, userId: string): Promise<number> {
    const userSessionsKey = CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId, {
      useHashTag: true,
    });

    const luaScript = `
      local sessions = redis.call("SMEMBERS", KEYS[1])
      local count = 0
      for _, sid in ipairs(sessions) do
        redis.call("DEL", ARGV[1] .. sid)
        count = count + 1
      end
      redis.call("DEL", KEYS[1])
      return count
    `;

    try {
      const result = await this.redisClient.eval(
        luaScript,
        1,
        userSessionsKey,
        CACHE_KEY_BUILDER.buildSession(''),
      );
      return Number(result) || 0;
    } catch (error) {
      this.logger.error(
        `Failed to execute purgeAllUserSessions Lua script for user ${userId}`,
        error,
      );
      throw error;
    }
  }
}
