import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';
import { CumulativeAccessEvaluator } from '../services/cumulative-access-evaluator.service';
import { UserAuthorizationCacheService } from '../services/user-authorization-cache.service';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';
export const RequirePermissions = (...permissions: string[]): MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  // In-memory L1 cache for role permissions: roleId -> { permissions: string[], expiry: number }
  private readonly roleL1Cache = new Map<string, { permissions: string[]; expiry: number }>();
  private readonly L1_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly reflector: Reflector,
    private readonly userAuthCacheService: UserAuthorizationCacheService,
    private readonly roleCacheService: RoleCacheService,
    private readonly roleRepo: RoleRepository,
    private readonly evaluator: CumulativeAccessEvaluator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantCode =
      request.tenantCode || request.headers?.['x-tenant-code'] || request.user?.tenantCode;
    const userId = request.user?.id || request.user?.userId || request.user?.sub;
    const employeeId = request.user?.employeeId || userId;

    if (!tenantCode || !userId) {
      this.logger.warn(
        'AuthorizationGuard failed: missing tenantCode or userId in request context',
      );
      throw new ForbiddenException('AUTHZ_PERMISSION_DENIED');
    }

    let userProfile;
    try {
      userProfile = await this.userAuthCacheService.getUserAuthorizationProfile(tenantCode, userId);
    } catch (err) {
      this.logger.error(`Error retrieving user authorization profile: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AUTHZ_STORE_UNAVAILABLE');
    }

    if (!userProfile || !userProfile.roles || userProfile.roles.length === 0) {
      throw new ForbiddenException('AUTHZ_PERMISSION_DENIED');
    }

    // Resolve permissions for all user roles using L1 -> Redis -> DB
    const rolePermissionsMap = new Map<string, string[]>();
    for (const roleAssignment of userProfile.roles) {
      const perms = await this.resolveRolePermissions(tenantCode, roleAssignment.roleId);
      rolePermissionsMap.set(roleAssignment.roleId, perms);
    }

    // Extract target resource attributes from request params, query, or body
    const targetResource = {
      employeeId: request.params?.employeeId || request.params?.id || request.body?.employeeId,
      managerId: request.params?.managerId || request.body?.managerId,
      companyId:
        request.params?.companyId || request.body?.companyId || request.headers?.['x-company-id'],
      locationId:
        request.params?.locationId ||
        request.body?.locationId ||
        request.headers?.['x-location-id'],
      departmentId:
        request.params?.departmentId ||
        request.body?.departmentId ||
        request.headers?.['x-department-id'],
    };

    // Every required permission in the decorator must be satisfied by cumulative evaluator
    for (const perm of requiredPermissions) {
      const allowed = this.evaluator.evaluateAccess(
        perm,
        userProfile.roles,
        rolePermissionsMap,
        targetResource,
        employeeId,
      );

      if (!allowed) {
        this.logger.debug(`Access denied for user ${userId} on permission ${perm}`);
        throw new ForbiddenException('AUTHZ_PERMISSION_DENIED');
      }
    }

    return true;
  }

  private async resolveRolePermissions(tenantCode: string, roleId: string): Promise<string[]> {
    const l1Key = `${tenantCode}:${roleId}`;
    const now = Date.now();

    const cachedL1 = this.roleL1Cache.get(l1Key);
    if (cachedL1 && cachedL1.expiry > now) {
      return cachedL1.permissions;
    }

    // Try Redis cache
    try {
      const cachedRole = await this.roleCacheService.getRole(tenantCode, roleId);
      if (cachedRole && Array.isArray(cachedRole.permissions)) {
        const perms = cachedRole.permissions.map((p: { code: string }) => p.code);
        this.roleL1Cache.set(l1Key, { permissions: perms, expiry: now + this.L1_TTL_MS });
        return perms;
      }
    } catch (err) {
      this.logger.warn(`Redis getRole error: ${(err as Error).message}`);
    }

    // Fallback to DB
    const dbRole = await this.roleRepo.findById(roleId, { relations: ['permissions'] });
    if (!dbRole) {
      return [];
    }

    const perms = (dbRole.permissions || []).map((p) => p.permissionCode);
    this.roleL1Cache.set(l1Key, { permissions: perms, expiry: now + this.L1_TTL_MS });
    return perms;
  }
}
