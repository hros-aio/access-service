import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { RoleCacheService } from './role-cache.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { PermissionDependencyService } from '../../permissions';
import {
  CopyRoleDto,
  CreateCustomRoleDto,
  DeactivateRoleDto,
  RenameRoleDto,
  RoleImpactResponseDto,
  RoleResponseDto,
  UpdateCustomRoleDto,
} from '../dto/role.dto';
import { RolePermission } from '../entities/role-permission.entity';
import { Role } from '../entities/role.entity';
import {
  CannotDeleteSystemRoleException,
  CannotMutateSystemRoleException,
  CriticalRoleDeactivationException,
  DuplicateRoleNameException,
  RoleNotFoundException,
  RoleVersionConflictException,
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

  async listRoles(filters?: { type?: string; status?: string }): Promise<RoleResponseDto[]> {
    const tenantCode = this.getActiveTenantCode();
    const roles = await this.roleRepository.findAllByTenant(tenantCode, filters);
    const results: RoleResponseDto[] = [];

    for (const role of roles) {
      const activeUserReachCount = await this.roleRepository.countActiveUserReach(
        role.id,
        tenantCode,
      );
      const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
        role.id,
        tenantCode,
      );
      results.push(
        RoleResponseDto.fromRole(role, activeUserReachCount, {
          isUnassigned: assignedUserGroupCount === 0,
          assignedUserGroupCount,
          activeUserReachCount,
        }),
      );
    }

    return results;
  }

  async getRoleById(roleId: string): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode();
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    const activeUserReachCount = await this.roleRepository.countActiveUserReach(
      role.id,
      tenantCode,
    );
    const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      role.id,
      tenantCode,
    );

    return RoleResponseDto.fromRole(role, activeUserReachCount, {
      isUnassigned: assignedUserGroupCount === 0,
      assignedUserGroupCount,
      activeUserReachCount,
    });
  }

  async createCustomRole(dto: CreateCustomRoleDto): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    // 1. Validate permissions against DAG dependency engine
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      throw new UnprocessableEntityException(
        `Capability dependency validation failed: ${validation.errors.join('; ')}`,
      );
    }

    // 2. Validate role name uniqueness within tenant
    const existing = await this.roleRepository.findByName(dto.name, tenantCode);
    if (existing) {
      throw new DuplicateRoleNameException(dto.name);
    }

    const createdRole = await this.transactionService.runInTransaction(async () => {
      const role = new Role();
      role.tenantCode = tenantCode;
      role.name = dto.name;
      role.description = dto.description;
      role.type = RoleType.CUSTOM;
      role.status = RoleStatus.ACTIVE;
      role.systemRoleKey = undefined;
      role.version = 1;
      role.createdBy = userId;
      role.updatedBy = userId;

      const savedRole = await this.roleRepository.save(role);

      // Insert role_permissions with is_protected = false
      const rolePermissions = dto.permissionCodes.map((code) => {
        const rp = new RolePermission();
        rp.tenantCode = tenantCode;
        rp.roleId = savedRole.id;
        rp.permissionCode = code;
        rp.isProtected = false;
        return rp;
      });

      if (rolePermissions.length > 0) {
        await this.rolePermissionRepository.bulkSave(rolePermissions);
      }

      // Record outbox event
      const outbox = AuthSecurityEventOutbox.fromRoleCreated(
        { tenantCode, userId },
        { role: savedRole, permissionCodes: dto.permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      const reloaded = await this.roleRepository.findById(savedRole.id);
      return reloaded ?? savedRole;
    });

    // Synchronous Redis cache seeding
    await this.roleCacheService.syncRole(createdRole);

    return RoleResponseDto.fromRole(createdRole, 0, {
      isUnassigned: true,
      assignedUserGroupCount: 0,
      activeUserReachCount: 0,
    });
  }

  async copyRole(sourceRoleId: string, dto: CopyRoleDto): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    const sourceRole = await this.roleRepository.findById(sourceRoleId);
    if (!sourceRole) {
      throw new RoleNotFoundException(sourceRoleId);
    }

    const existingName = await this.roleRepository.findByName(dto.name, tenantCode);
    if (existingName) {
      throw new DuplicateRoleNameException(dto.name);
    }

    const permissionCodes = (sourceRole.permissions || []).map((p) => p.permissionCode);

    const clonedRole = await this.transactionService.runInTransaction(async () => {
      const role = new Role();
      role.tenantCode = tenantCode;
      role.name = dto.name;
      role.description = dto.description ?? sourceRole.description;
      role.type = RoleType.CUSTOM;
      role.status = RoleStatus.ACTIVE;
      role.systemRoleKey = undefined;
      role.version = 1;
      role.createdBy = userId;
      role.updatedBy = userId;

      const savedRole = await this.roleRepository.save(role);

      // Clone permissions with is_protected = false explicitly
      const rolePermissions = permissionCodes.map((code) => {
        const rp = new RolePermission();
        rp.tenantCode = tenantCode;
        rp.roleId = savedRole.id;
        rp.permissionCode = code;
        rp.isProtected = false;
        return rp;
      });

      if (rolePermissions.length > 0) {
        await this.rolePermissionRepository.bulkSave(rolePermissions);
      }

      // Record outbox event
      const outbox = AuthSecurityEventOutbox.fromRoleCopied(
        { tenantCode, userId },
        { role: savedRole, sourceRoleId, permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      const reloaded = await this.roleRepository.findById(savedRole.id);
      return reloaded ?? savedRole;
    });

    await this.roleCacheService.syncRole(clonedRole);

    return RoleResponseDto.fromRole(clonedRole, 0, {
      isUnassigned: true,
      assignedUserGroupCount: 0,
      activeUserReachCount: 0,
    });
  }

  async estimateImpact(roleId: string): Promise<RoleImpactResponseDto> {
    const tenantCode = this.getActiveTenantCode();
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    const activeUserReachCount = await this.roleRepository.countActiveUserReach(
      role.id,
      tenantCode,
    );
    const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      role.id,
      tenantCode,
    );

    return {
      roleId: role.id,
      assignedUserGroupCount,
      activeUserReachCount,
      isUnassigned: assignedUserGroupCount === 0,
    };
  }

  async updateCustomRole(
    roleId: string,
    dto: UpdateCustomRoleDto,
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserCount?: number;
    message?: string;
  }> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    if (role.type === RoleType.SYSTEM) {
      throw new CannotMutateSystemRoleException(role.name);
    }

    // 1. Optimistic locking check
    if (dto.version !== undefined && role.version !== dto.version) {
      throw new RoleVersionConflictException(role.id, dto.version, role.version);
    }

    // 2. Validate name uniqueness if changed
    if (role.name !== dto.name) {
      const existing = await this.roleRepository.findByName(dto.name, tenantCode);
      if (existing && existing.id !== role.id) {
        throw new DuplicateRoleNameException(dto.name);
      }
    }

    // 3. Capability dependency validation
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      throw new UnprocessableEntityException(
        `Capability dependency validation failed: ${validation.errors.join('; ')}`,
      );
    }

    // 4. High-impact blast radius check
    const affectedUserCount = await this.roleRepository.countActiveUserReach(roleId, tenantCode);
    if (affectedUserCount >= this.HIGH_IMPACT_THRESHOLD && !dto.confirmedHighImpact) {
      return {
        confirmationRequired: true,
        affectedUserCount,
        message: `This role change affects ${affectedUserCount} users. Explicit confirmation is required.`,
      };
    }

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRole) {
        throw new RoleNotFoundException(roleId);
      }

      if (dto.version !== undefined && lockedRole.version !== dto.version) {
        throw new RoleVersionConflictException(lockedRole.id, dto.version, lockedRole.version);
      }

      lockedRole.name = dto.name;
      if (dto.description !== undefined) {
        lockedRole.description = dto.description;
      }
      lockedRole.version += 1;
      lockedRole.updatedBy = userId;

      await this.rolePermissionRepository.deleteByRoleId(lockedRole.id);

      const newRolePermissions = dto.permissionCodes.map((code) => {
        const rp = new RolePermission();
        rp.tenantCode = tenantCode;
        rp.roleId = lockedRole.id;
        rp.permissionCode = code;
        rp.isProtected = false;
        return rp;
      });

      if (newRolePermissions.length > 0) {
        await this.rolePermissionRepository.bulkSave(newRolePermissions);
      }

      const savedRole = await this.roleRepository.save(lockedRole);

      const outbox = AuthSecurityEventOutbox.fromPermissionsUpdated(
        { tenantCode, userId },
        { role: savedRole, permissionCodes: dto.permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      const reloaded = await this.roleRepository.findById(savedRole.id);
      return reloaded ?? savedRole;
    });

    await this.roleCacheService.syncRole(updatedRole);

    const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      updatedRole.id,
      tenantCode,
    );

    return {
      role: RoleResponseDto.fromRole(updatedRole, affectedUserCount, {
        isUnassigned: assignedUserGroupCount === 0,
        assignedUserGroupCount,
        activeUserReachCount: affectedUserCount,
      }),
    };
  }

  async deactivateRole(
    roleId: string,
    dto?: DeactivateRoleDto,
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserGroupCount?: number;
    affectedUserCount?: number;
    message?: string;
  }> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    if (role.type === RoleType.SYSTEM && role.systemRoleKey === SystemRoleKey.ADMINISTRATOR) {
      throw new CriticalRoleDeactivationException(role.name);
    }

    if (dto?.version !== undefined && role.version !== dto.version) {
      throw new RoleVersionConflictException(role.id, dto.version, role.version);
    }

    const affectedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      roleId,
      tenantCode,
    );
    const affectedUserCount = await this.roleRepository.countActiveUserReach(roleId, tenantCode);

    if (affectedUserGroupCount > 0 && !dto?.confirmed) {
      return {
        confirmationRequired: true,
        affectedUserGroupCount,
        affectedUserCount,
        message: `This role is currently assigned to ${affectedUserGroupCount} User Group(s) affecting ${affectedUserCount} user(s). Explicit confirmation is required to deactivate.`,
      };
    }

    const deactivatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRole) {
        throw new RoleNotFoundException(roleId);
      }

      if (dto?.version !== undefined && lockedRole.version !== dto.version) {
        throw new RoleVersionConflictException(lockedRole.id, dto.version, lockedRole.version);
      }

      lockedRole.status = RoleStatus.INACTIVE;
      lockedRole.version += 1;
      lockedRole.updatedBy = userId;

      const saved = await this.roleRepository.save(lockedRole);

      const outbox = AuthSecurityEventOutbox.fromRoleDeactivated(
        { tenantCode, userId },
        {
          role: saved,
          affectedUserGroupCount,
          affectedUserCount,
        },
      );
      await this.outboxRepository.save(outbox);

      return saved;
    });

    await this.roleCacheService.syncRole(deactivatedRole);

    return {
      role: RoleResponseDto.fromRole(deactivatedRole, affectedUserCount, {
        isUnassigned: affectedUserGroupCount === 0,
        assignedUserGroupCount: affectedUserGroupCount,
        activeUserReachCount: affectedUserCount,
      }),
    };
  }

  async reactivateRole(roleId: string): Promise<RoleResponseDto> {
    const tenantCode = this.getActiveTenantCode() ?? 'UNKNOWN';
    const userId = this.getActiveUserId();

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new RoleNotFoundException(roleId);
    }

    const reactivatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRole) {
        throw new RoleNotFoundException(roleId);
      }

      lockedRole.status = RoleStatus.ACTIVE;
      lockedRole.version += 1;
      lockedRole.updatedBy = userId;

      const saved = await this.roleRepository.save(lockedRole);

      const outbox = AuthSecurityEventOutbox.fromRoleReactivated(
        { tenantCode, userId },
        { role: saved },
      );
      await this.outboxRepository.save(outbox);

      return saved;
    });

    await this.roleCacheService.syncRole(reactivatedRole);

    const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      reactivatedRole.id,
      tenantCode,
    );
    const activeUserReachCount = await this.roleRepository.countActiveUserReach(
      reactivatedRole.id,
      tenantCode,
    );

    return RoleResponseDto.fromRole(reactivatedRole, activeUserReachCount, {
      isUnassigned: assignedUserGroupCount === 0,
      assignedUserGroupCount,
      activeUserReachCount,
    });
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

      const outbox = AuthSecurityEventOutbox.fromRenameRole(
        { tenantCode, userId },
        { role: saved, oldName, newName: saved.name },
      );
      await this.outboxRepository.save(outbox);

      return saved;
    });

    await this.roleCacheService.syncRole(updatedRole);

    return RoleResponseDto.fromRole(updatedRole);
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
