import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { GenerateUserAuthzCacheKey, GenerateUserAuthzVersionKey } from '../../../constants';
import {
  EffectiveUserRole,
  UserAuthorizationProfile,
} from '../interfaces/effective-user-role.interface';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

@Injectable()
export class UserAuthorizationCacheService {
  private readonly logger = new Logger(UserAuthorizationCacheService.name);
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly effectiveRoleRepo: UserEffectiveRoleRepository,
  ) {}

  async syncUserCache(
    tenantCode: string,
    userId: string,
    explicitRoles?: EffectiveUserRole[],
  ): Promise<UserAuthorizationProfile> {
    let roles = explicitRoles;
    if (!roles) {
      const dbRows = await this.effectiveRoleRepo.findByEmployee(tenantCode, userId);
      roles = dbRows.map((r) => ({
        roleId: r.roleId,
        sourceGroupId: r.sourceGroupId,
        scope: {
          type: r.scopeType as EffectiveUserRole['scope']['type'],
          refId: r.scopeEntityId || null,
        },
      }));
    }

    let version = 1;
    const redisClient = this.redisCacheProvider.getClient();
    if (redisClient) {
      try {
        version = await redisClient.incr(GenerateUserAuthzVersionKey(tenantCode, userId));
      } catch (err) {
        this.logger.warn(
          `Failed to increment version for user ${userId}: ${(err as Error).message}`,
        );
      }
    }

    const payload: UserAuthorizationProfile = {
      version,
      roles,
    };

    if (redisClient) {
      try {
        const key = GenerateUserAuthzCacheKey(tenantCode, userId);
        await redisClient.set(key, JSON.stringify(payload), 'EX', this.TTL_SECONDS);
      } catch (err) {
        this.logger.error(
          `Failed to write authorization cache for user ${userId}: ${(err as Error).message}`,
        );
      }
    }

    return payload;
  }

  async getUserAuthorizationProfile(
    tenantCode: string,
    userId: string,
  ): Promise<UserAuthorizationProfile> {
    const redisClient = this.redisCacheProvider.getClient();
    if (redisClient) {
      try {
        const key = GenerateUserAuthzCacheKey(tenantCode, userId);
        const data = await redisClient.get(key);
        if (data) {
          return JSON.parse(data) as UserAuthorizationProfile;
        }
      } catch (err) {
        this.logger.warn(
          `Redis get failed for authz:user:${tenantCode}:${userId}: ${(err as Error).message}`,
        );
      }
    }

    // Cache miss or Redis down: fallback to DB projection recovery
    return this.recoverUserCacheOnMiss(tenantCode, userId);
  }

  async recoverUserCacheOnMiss(
    tenantCode: string,
    userId: string,
  ): Promise<UserAuthorizationProfile> {
    return this.syncUserCache(tenantCode, userId);
  }

  async invalidateUserCache(tenantCode: string, userId: string): Promise<void> {
    const redisClient = this.redisCacheProvider.getClient();
    if (!redisClient) return;
    try {
      const key = GenerateUserAuthzCacheKey(tenantCode, userId);
      await redisClient.del(key);
    } catch (err) {
      this.logger.warn(`Failed to invalidate cache for user ${userId}: ${(err as Error).message}`);
    }
  }
}
