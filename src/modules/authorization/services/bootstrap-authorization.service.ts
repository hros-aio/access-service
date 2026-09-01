import { Injectable, Logger } from '@nestjs/common';

import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';
import { BootstrapCapabilitiesResponseDto } from '../dto/bootstrap-capabilities-response.dto';

@Injectable()
export class BootstrapAuthorizationService {
  private readonly logger = new Logger(BootstrapAuthorizationService.name);

  constructor(
    private readonly userAuthCacheService: UserAuthorizationCacheService,
    private readonly roleCacheService: RoleCacheService,
    private readonly roleRepo: RoleRepository,
  ) {}

  async getBootstrapCapabilities(
    tenantCode: string,
    userId: string,
  ): Promise<BootstrapCapabilitiesResponseDto> {
    const userProfile = await this.userAuthCacheService.getUserAuthorizationProfile(
      tenantCode,
      userId,
    );

    if (!userProfile || !userProfile.roles || userProfile.roles.length === 0) {
      return {
        authorizationVersion: userProfile?.version || 1,
        permissions: [],
        modules: [],
        roles: [],
      };
    }

    const permissionSet = new Set<string>();
    const roleNamesSet = new Set<string>();

    for (const roleAssignment of userProfile.roles) {
      // Fetch role details & permissions from Redis / DB
      let cachedRole = null;
      try {
        cachedRole = await this.roleCacheService.getRole(tenantCode, roleAssignment.roleId);
      } catch (err) {
        this.logger.warn(
          `Redis lookup failed for role ${roleAssignment.roleId}: ${(err as Error).message}`,
        );
      }

      if (cachedRole) {
        if (cachedRole.name) {
          roleNamesSet.add(cachedRole.name as string);
        }
        if (Array.isArray(cachedRole.permissions)) {
          for (const p of cachedRole.permissions) {
            if (p.code) permissionSet.add(p.code);
          }
        }
      } else {
        // Fallback to database
        const dbRole = await this.roleRepo.findById(roleAssignment.roleId, {
          relations: ['permissions'],
        });
        if (dbRole) {
          roleNamesSet.add(dbRole.name);
          if (dbRole.permissions) {
            for (const p of dbRole.permissions) {
              permissionSet.add(p.permissionCode);
            }
          }
        }
      }
    }

    const permissions = Array.from(permissionSet);

    // Derive authorized modules from PermissionCatalogService
    const catalogModules = this.deriveModulesFromPermissions(permissions);

    return {
      authorizationVersion: userProfile.version,
      permissions,
      modules: catalogModules,
      roles: Array.from(roleNamesSet),
    };
  }

  private deriveModulesFromPermissions(permissions: string[]): string[] {
    const modulesSet = new Set<string>();

    // Derive top-level module names from permission catalog format e.g. "employee.view" -> "employee"
    for (const perm of permissions) {
      const parts = perm.split('.');
      if (parts.length > 0 && parts[0]) {
        modulesSet.add(parts[0]);
      }
    }

    return Array.from(modulesSet);
  }
}
