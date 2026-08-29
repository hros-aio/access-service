import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

import {
  EffectiveUserRole,
  UserAuthorizationProfile,
} from '../interfaces/effective-user-role.interface';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

interface RedisClientInterface {
  set(key: string, value: string, mode: string, duration: number): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
}

@Injectable()
export class UserAuthorizationCacheService {
  private readonly logger = new Logger(UserAuthorizationCacheService.name);
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly effectiveRoleRepo: UserEffectiveRoleRepository,
  ) {}

  private get client(): RedisClientInterface | undefined {
    return (this.redisCacheProvider as unknown as { client?: RedisClientInterface }).client;
  }

  private getUserCacheKey(tenantCode: string, userId: string): string {
    return `authz:user:${tenantCode}:${userId}`;
  }

  private getVersionKey(tenantCode: string, userId: string): string {
    return `authz:version:${tenantCode}:${userId}`;
  }

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
    if (this.client) {
      try {
        version = await this.client.incr(this.getVersionKey(tenantCode, userId));
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

    if (this.client) {
      try {
        const key = this.getUserCacheKey(tenantCode, userId);
        await this.client.set(key, JSON.stringify(payload), 'EX', this.TTL_SECONDS);
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
    if (this.client) {
      try {
        const key = this.getUserCacheKey(tenantCode, userId);
        const data = await this.client.get(key);
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
    if (!this.client) return;
    try {
      const key = this.getUserCacheKey(tenantCode, userId);
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Failed to invalidate cache for user ${userId}: ${(err as Error).message}`);
    }
  }
}
