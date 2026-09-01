import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import Redis from 'ioredis';

@Injectable()
export class IpLockoutRedisAdapter {
  private readonly defaultTtlSeconds = 3600;

  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  private getRedisClient(): Redis | null {
    return this.redisCacheProvider.getClient();
  }

  public getKey(tenantCode: string, userId: string): string {
    return `auth:ip-failure:${tenantCode}:${userId}`;
  }

  public async incrementIpFailureCounter(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    const key = this.getKey(tenantCode, userId);
    if (client) {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, this.defaultTtlSeconds);
      }
      return count;
    }
    return 1;
  }

  public async getIpFailureCount(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    const key = this.getKey(tenantCode, userId);
    if (client) {
      const val = await client.get(key);
      return val ? parseInt(val, 10) || 0 : 0;
    }
    return 0;
  }

  public async resetIpFailureCounter(tenantCode: string, userId: string): Promise<void> {
    const client = this.getRedisClient();
    const key = this.getKey(tenantCode, userId);
    if (client) {
      await client.del(key);
    }
  }
}
