import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PROVIDER_TOKEN, CacheService } from '@new-hros/libs-core';

import { GenerateRoleAuthzCacheKey } from '../../../constants';
import { Role } from '../entities/role.entity';
import { CachedRoleData } from '../interfaces/system-role-template.interface';

@Injectable()
export class RoleCacheService {
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(
    @Inject(CACHE_PROVIDER_TOKEN)
    private readonly cacheService: CacheService,
  ) {}

  async syncRole(role: Role): Promise<void> {
    const key = GenerateRoleAuthzCacheKey(role.tenantCode, role.id);
    const cachedData: CachedRoleData = {
      roleId: role.id,
      tenantCode: role.tenantCode,
      name: role.name,
      type: role.type,
      systemRoleKey: role.systemRoleKey,
      status: role.status,
      version: role.version,
      permissions: (role.permissions || []).map((p) => ({
        code: p.permissionCode,
        isProtected: p.isProtected,
      })),
      updatedAt: new Date().toISOString(),
    };

    await this.cacheService.set(key, cachedData, this.TTL_SECONDS);
  }

  async getRole(tenantCode: string, roleId: string): Promise<CachedRoleData | null> {
    const key = GenerateRoleAuthzCacheKey(tenantCode, roleId);
    return this.cacheService.get<CachedRoleData>(key);
  }

  async invalidateRole(tenantCode: string, roleId: string): Promise<void> {
    const key = GenerateRoleAuthzCacheKey(tenantCode, roleId);
    await this.cacheService.del(key);
  }
}
