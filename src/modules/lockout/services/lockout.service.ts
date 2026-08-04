import { Injectable, Optional } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import Redis from 'ioredis';

import { UserStatus } from '../../../enums';
import { AuthStoreUnavailableError } from '../../auth/exceptions/auth.exception';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { RedisLockoutAdapter } from '../adapters/redis-lockout.adapter';

@Injectable()
export class LockoutService {
  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly userRepository: UserRepository,
    private readonly transactionService: TransactionService,
    @Optional() private readonly securityEventService?: SecurityEventService,
  ) {}

  private getRedisClient(): Redis | null {
    const provider = this.redisCacheProvider as unknown as {
      getClient?(): Redis | null;
    };
    return provider.getClient?.() ?? null;
  }

  private getAdapter(): RedisLockoutAdapter {
    const client = this.getRedisClient();
    if (!client) {
      throw new AuthStoreUnavailableError('Redis client is unavailable');
    }
    return new RedisLockoutAdapter(client);
  }

  async getFailureCount(tenantCode: string, userId: string): Promise<number> {
    try {
      return await this.getAdapter().getCredentialFailureCount(tenantCode, userId);
    } catch (err) {
      if (err instanceof AuthStoreUnavailableError) throw err;
      throw new AuthStoreUnavailableError('Redis lookup failure', err);
    }
  }

  async incrementFailureCount(tenantCode: string, userId: string): Promise<number> {
    try {
      return await this.getAdapter().incrementCredentialFailure(tenantCode, userId, 900);
    } catch (err) {
      if (err instanceof AuthStoreUnavailableError) throw err;
      throw new AuthStoreUnavailableError('Redis increment failure', err);
    }
  }

  async recordIpFailure(tenantCode: string, userId: string, sourceIp: string): Promise<number> {
    try {
      const adapter = this.getAdapter();
      const count = await adapter.incrementIpFailure(tenantCode, userId, 900);
      if (count >= 10 && this.securityEventService) {
        await this.securityEventService.logLoginFailed(
          tenantCode,
          'ip-restriction-alert',
          sourceIp,
          'UNAPPROVED_IP_SPIKE',
          userId,
          'system',
        );
      }
      return count;
    } catch (err) {
      if (err instanceof AuthStoreUnavailableError) throw err;
      throw new AuthStoreUnavailableError('Redis IP failure increment error', err);
    }
  }

  async resetFailureCount(tenantCode: string, userId: string): Promise<void> {
    try {
      await this.getAdapter().resetCredentialFailure(tenantCode, userId);
    } catch (err) {
      if (err instanceof AuthStoreUnavailableError) throw err;
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
          lockedUser.securityVersion = (lockedUser.securityVersion || 1) + 1;
          await this.transactionService.getManager().getRepository(User).save(lockedUser);
          await this.resetFailureCount(tenantCode, userId);
          return true;
        }
        return false;
      });
    }
    return false;
  }
}
