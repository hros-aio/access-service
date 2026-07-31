import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserStatus } from '../../../enums';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';

interface RedisClient {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
}

@Injectable()
export class LockoutService {
  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly userRepository: UserRepository,
    private readonly transactionService: TransactionService,
  ) {}

  private getRedisClient(): RedisClient | null {
    return (this.redisCacheProvider as unknown as { client: RedisClient | null }).client;
  }

  async getFailureCount(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    if (!client) return 0;
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    const val = await client.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  async incrementFailureCount(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    if (!client) return 0;
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, 900); // 15 mins rolling window
    }
    return count;
  }

  async resetFailureCount(tenantCode: string, userId: string): Promise<void> {
    const client = this.getRedisClient();
    if (!client) return;
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    await client.del(key);
  }

  async handleFailure(
    tenantCode: string,
    userId: string,
    settings?: AuthenticationSettings,
  ): Promise<boolean> {
    if (!settings || !settings.accountLockoutEnabled) {
      return false;
    }

    const count = await this.incrementFailureCount(tenantCode, userId);
    if (count >= settings.maxFailedRetries) {
      // Lock user account under pessimistic write lock inside a transaction
      return this.transactionService.runInTransaction(async () => {
        const lockedUser = await this.transactionService
          .getManager()
          .getRepository(User)
          .findOne({
            where: { id: userId },
            lock: { mode: 'pessimistic_write' },
          });

        if (lockedUser && lockedUser.status !== UserStatus.LOCKED) {
          lockedUser.status = UserStatus.LOCKED;
          await this.transactionService.getManager().getRepository(User).save(lockedUser);
          return true; // indicates account was locked in this call
        }
        return false;
      });
    }
    return false;
  }
}
