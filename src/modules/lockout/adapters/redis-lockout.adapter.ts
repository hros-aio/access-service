import * as fs from 'fs';
import * as path from 'path';

import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockoutAdapter {
  private readonly incrLuaScript: string;

  constructor(private readonly redisClient: Redis) {
    const luaPath = path.join(__dirname, '../scripts/incr-counter.lua');
    this.incrLuaScript = fs.readFileSync(luaPath, 'utf8');
  }

  async incrementCredentialFailure(
    tenantCode: string,
    userId: string,
    ttlSeconds = 900,
  ): Promise<number> {
    const key = `auth:login-failure:{${tenantCode}}:${userId}`;
    const result = await this.redisClient.eval(this.incrLuaScript, 1, key, ttlSeconds);
    return Number(result);
  }

  async incrementIpFailure(tenantCode: string, userId: string, ttlSeconds = 900): Promise<number> {
    const key = `auth:ip-failure:{${tenantCode}}:${userId}`;
    const result = await this.redisClient.eval(this.incrLuaScript, 1, key, ttlSeconds);
    return Number(result);
  }

  async resetCredentialFailure(tenantCode: string, userId: string): Promise<void> {
    const key = `auth:login-failure:{${tenantCode}}:${userId}`;
    await this.redisClient.del(key);
  }

  async getCredentialFailureCount(tenantCode: string, userId: string): Promise<number> {
    const key = `auth:login-failure:{${tenantCode}}:${userId}`;
    const val = await this.redisClient.get(key);
    return val ? parseInt(val, 10) : 0;
  }
}
