import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { Role } from '../entities/role.entity';

interface RedisClientInterface {
  set(key: string, value: string, mode: string, duration: number): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

@Injectable()
export class RoleCacheService {
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  private get client(): RedisClientInterface | undefined {
    return (this.redisCacheProvider as unknown as { client?: RedisClientInterface }).client;
  }

  private getCacheKey(tenantCode: string, roleId: string): string {
    return `authz:role:${tenantCode}:${roleId}`;
  }

  async syncRole(role: Role): Promise<void> {
    if (!this.client) return;
    const key = this.getCacheKey(role.tenantCode, role.id);
    const cachedData = {
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

    await this.client.set(key, JSON.stringify(cachedData), 'EX', this.TTL_SECONDS);
  }

  async getRole(tenantCode: string, roleId: string): Promise<Record<string, unknown> | null> {
    if (!this.client) return null;
    const key = this.getCacheKey(tenantCode, roleId);
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async invalidateRole(tenantCode: string, roleId: string): Promise<void> {
    if (!this.client) return;
    const key = this.getCacheKey(tenantCode, roleId);
    await this.client.del(key);
  }
}
