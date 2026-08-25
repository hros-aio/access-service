import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { RoleCacheService } from './role-cache.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { PermissionDependencyService } from '../../permissions';
import { RenameRoleDto, RoleResponseDto, UpdateRolePermissionsDto } from '../dto/role.dto';
import { RolePermission } from '../entities/role-permission.entity';
import {
  CannotDeleteSystemRoleException,
  CriticalRoleDeactivationException,
  DuplicateRoleNameException,
  ProtectedCapabilityRemovalException,
  RoleNotFoundException,
} from '../exceptions/role.exceptions';
import { RoleStatus, RoleType, SystemRoleKey } from '../interfaces/system-role-template.interface';
import { RolePermissionRepository } from '../repositories/role-permission.repository';
import { RoleRepository } from '../repositories/role.repository';

@Injectable()
export class RoleApplicationService {
  private readonly HIGH_IMPACT_THRESHOLD = 50;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly roleRepository: RoleRepository,
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly roleCacheService: RoleCacheService,
    private readonly permissionDependencyService: PermissionDependencyService,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
  ) {}

  private getActiveTenantCode(): string | undefined {
    return RequestContextService.getTenantCode() ?? undefined;
  }

  private getActiveUserId(): string {
    return RequestContextService.getUser()?.userId ?? 'SYSTEM';
  }

  async listRoles(): Promise<RoleResponseDto[]> {
    const tenantCode = this.getActiveTenantCode();
    const roles = await this.roleRepository.findAllByTenant(tenantCode);
    const results: RoleResponseDto[] = [];

    for (const role of roles) {
      const userCount = await this.roleRepository.countAssignedUsers(role.id, tenantCode);
      results.push(RoleResponseDto.fromRole(role, userCount));
    }

    return results;
  }

  async getRoleById(roleId: string): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode();
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    const userCount = await this.roleRepository.countAssignedUsers(role.id, tenantCode);
    return RoleResponseDto.fromRole(role, userCount);
  }

  async renameRole(roleId: string, dto: RenameRoleDto): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!role) {
        throw new RoleNotFoundException(roleId);
      }

      // Check name uniqueness if changed
      if (role.name !== dto.name) {
        const existing = await this.roleRepository.findByName(dto.name, tenantCode);
        if (existing && existing.id !== role.id) {
          throw new DuplicateRoleNameException(dto.name);
        }
      }

      const oldName = role.name;
      role.name = dto.name;
      if (dto.description !== undefined) {
        role.description = dto.description;
      }
      role.version += 1;
      role.updatedBy = userId;

      const saved = await this.roleRepository.save(role);

      // Record audit outbox event via static factory
      const outbox = AuthSecurityEventOutbox.fromRenameRole(
        { tenantCode, userId },
        { role: saved, oldName, newName: saved.name },
      );
      await this.outboxRepository.save(outbox);

      return saved;
    });

    // Synchronous Redis cache propagation
    await this.roleCacheService.syncRole(updatedRole);

    return RoleResponseDto.fromRole(updatedRole);
  }

  async updatePermissions(
    roleId: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserCount?: number;
    message?: string;
  }> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    // 1. Dependency validation via PermissionCatalogModule
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      throw new Error(`Capability dependency validation failed: ${validation.errors.join('; ')}`);
    }

    // 2. High-impact check
    const affectedUserCount = await this.roleRepository.countAssignedUsers(roleId, tenantCode);
    if (affectedUserCount >= this.HIGH_IMPACT_THRESHOLD && !dto.confirmedHighImpact) {
      return {
        confirmationRequired: true,
        affectedUserCount,
        message: `This role change affects ${affectedUserCount} users. Explicit confirmation is required.`,
      };
    }

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!role) {
        throw new RoleNotFoundException(roleId);
      }

      const existingPermissions = role.permissions || [];
      const protectedPerms = existingPermissions.filter((p) => p.isProtected);
      const omittedProtected = protectedPerms.filter(
        (p) => !dto.permissionCodes.includes(p.permissionCode),
      );

      // 3. Inviolable protected capability invariant
      if (omittedProtected.length > 0) {
        const outbox = AuthSecurityEventOutbox.fromProtectedCapabilityViolation(
          { tenantCode, userId },
          {
            role,
            omittedProtectedCapabilities: omittedProtected.map((p) => p.permissionCode),
          },
        );
        await this.outboxRepository.save(outbox);

        throw new ProtectedCapabilityRemovalException(
          role.name,
          omittedProtected.map((p) => p.permissionCode),
        );
      }

      // 4. Update permissions
      // Keep protected permissions intact, remove unselected non-protected, add new non-protected
      const protectedCodes = new Set(protectedPerms.map((p) => p.permissionCode));
      const newNonProtectedCodes = dto.permissionCodes.filter((code) => !protectedCodes.has(code));

      // Remove existing non-protected permissions
      await this.rolePermissionRepository.deleteNonProtectedByRoleId(role.id);

      // Insert new non-protected permissions
      const newRolePermissions = newNonProtectedCodes.map((code) => {
        const rp = new RolePermission();
        rp.tenantCode = tenantCode;
        rp.roleId = role.id;
        rp.permissionCode = code;
        rp.isProtected = false;
        return rp;
      });
      await this.rolePermissionRepository.bulkSave(newRolePermissions);

      // Increment role version
      role.version += 1;
      role.updatedBy = userId;
      const savedRole = await this.roleRepository.save(role);

      // Re-fetch role with updated permissions
      const reloadedRole = await this.roleRepository.findById(savedRole.id);

      // Record outbox event via static factory
      const outbox = AuthSecurityEventOutbox.fromPermissionsUpdated(
        { tenantCode, userId },
        {
          role: savedRole,
          permissionCodes: dto.permissionCodes,
        },
      );
      await this.outboxRepository.save(outbox);

      return reloadedRole ?? savedRole;
    });

    // Synchronous Redis cache update
    await this.roleCacheService.syncRole(updatedRole);

    return { role: RoleResponseDto.fromRole(updatedRole, affectedUserCount) };
  }

  async updateRoleStatus(roleId: string, status: RoleStatus): Promise<RoleResponseDto> {
    const userId = this.getActiveUserId();

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!role) {
        throw new RoleNotFoundException(roleId);
      }

      // Prevent deactivation of critical system roles
      if (status === RoleStatus.INACTIVE && role.systemRoleKey === SystemRoleKey.ADMINISTRATOR) {
        throw new CriticalRoleDeactivationException(role.name);
      }

      role.status = status;
      role.version += 1;
      role.updatedBy = userId;

      return this.roleRepository.save(role);
    });

    await this.roleCacheService.syncRole(updatedRole);
    return RoleResponseDto.fromRole(updatedRole);
  }

  async deleteRole(roleId: string): Promise<void> {
    await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!role) {
        throw new RoleNotFoundException(roleId);
      }

      if (role.type === RoleType.SYSTEM) {
        throw new CannotDeleteSystemRoleException(role.id, role.name);
      }

      await this.rolePermissionRepository.deleteByRoleId(role.id);
      await this.roleRepository.delete(role.id);
    });

    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    await this.roleCacheService.invalidateRole(tenantCode, roleId);
  }
}
