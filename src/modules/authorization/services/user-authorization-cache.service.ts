import { Injectable, Logger } from '@nestjs/common';
import {
  CACHE_KEY_BUILDER,
  CacheService,
  EffectiveUserRole,
  RedisCacheProvider,
  UserAuthorizationProfile,
} from '@new-hros/libs-core';

import { GenerateUserAuthzVersionKey } from '../../../constants';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

@Injectable()
export class UserAuthorizationCacheService {
  private readonly logger = new Logger(UserAuthorizationCacheService.name);
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly cacheService: CacheService,
    private readonly effectiveRoleRepo: UserEffectiveRoleRepository,
  ) {}

  async syncUserCache(
    tenantCode: string,
    userId: string,
    explicitRoles?: EffectiveUserRole[],
  ): Promise<UserAuthorizationProfile> {
    let roles = explicitRoles;
    if (!roles) {
      const dbRows = await this.effectiveRoleRepo.findByEmployee(userId);
      roles = dbRows.map((r) => ({
        roleId: r.roleId,
        sourceGroupId: r.sourceGroupId,
        scope: {
          type: r.scopeType,
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

    try {
      const key = CACHE_KEY_BUILDER.buildUserAuthz(tenantCode, userId);
      await this.cacheService.set(key, payload, this.TTL_SECONDS);
    } catch (err) {
      this.logger.error(
        `Failed to write authorization cache for user ${userId}: ${(err as Error).message}`,
      );
    }

    return payload;
  }

  async getUserAuthorizationProfile(
    tenantCode: string,
    userId: string,
  ): Promise<UserAuthorizationProfile> {
    try {
      const key = CACHE_KEY_BUILDER.buildUserAuthz(tenantCode, userId);
      const data = await this.cacheService.get<UserAuthorizationProfile>(key);
      if (data) {
        return data;
      }
    } catch (err) {
      this.logger.warn(
        `Redis get failed for authz:user:${tenantCode}:${userId}: ${(err as Error).message}`,
      );
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
    try {
      const key = CACHE_KEY_BUILDER.buildUserAuthz(tenantCode, userId);
      await this.cacheService.del(key);
    } catch (err) {
      this.logger.warn(`Failed to invalidate cache for user ${userId}: ${(err as Error).message}`);
    }
  }
}
