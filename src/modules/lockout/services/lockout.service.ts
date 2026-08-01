import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import Redis from 'ioredis';

import { UserStatus } from '../../../enums';
import { AuthStoreUnavailableError } from '../../auth/exceptions/auth.exception';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';

@Injectable()
export class LockoutService {
  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly userRepository: UserRepository,
    private readonly transactionService: TransactionService,
  ) {}

  private getRedisClient(): Redis | null {
    const provider = this.redisCacheProvider as unknown as {
      getClient?(): Redis | null;
    };
    return provider.getClient?.() ?? null;
  }

  async getFailureCount(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    if (!client) {
      throw new AuthStoreUnavailableError('Redis client is unavailable');
    }
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    try {
      const val = await client.get(key);
      return val ? parseInt(val, 10) : 0;
    } catch (err) {
      throw new AuthStoreUnavailableError('Redis lookup failure', err);
    }
  }

  async incrementFailureCount(tenantCode: string, userId: string): Promise<number> {
    const client = this.getRedisClient();
    if (!client) {
      throw new AuthStoreUnavailableError('Redis client is unavailable');
    }
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, 900); // 15 mins rolling window
      }
      return count;
    } catch (err) {
      throw new AuthStoreUnavailableError('Redis increment failure', err);
    }
  }

  async resetFailureCount(tenantCode: string, userId: string): Promise<void> {
    const client = this.getRedisClient();
    if (!client) {
      throw new AuthStoreUnavailableError('Redis client is unavailable');
    }
    const key = `auth:login-failure:${tenantCode}:${userId}`;
    try {
      await client.del(key);
    } catch (err) {
      throw new AuthStoreUnavailableError('Redis delete failure', err);
    }
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
    const threshold = settings.maxFailedRetries || 5;

    if (count >= threshold) {
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
          await this.resetFailureCount(tenantCode, userId);
          return true; // indicates account was locked in this call
        }
        return false;
      });
    }
    return false;
  }
}
