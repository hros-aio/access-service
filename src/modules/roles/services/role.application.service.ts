import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { PaginatedResult, TransactionService } from '@new-hros/libs-sql';

import { RoleCacheService } from './role-cache.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { PermissionDependencyService } from '../../permissions';
import { SYSTEM_ROLE_TEMPLATES } from '../constants/system-role-templates.constant';
import {
  CopyRoleDto,
  CreateCustomRoleDto,
  DeactivateRoleDto,
  FilterRoleDto,
  HighImpactConfirmationRequiredResponseDto,
  RenameRoleDto,
  UpdateCustomRoleDto,
} from '../dto/role.dto';
import { RolePermission } from '../entities/role-permission.entity';
import { Role } from '../entities/role.entity';
import {
  CannotDeleteSystemRoleException,
  CannotMutateSystemRoleException,
  CriticalRoleDeactivationException,
  DuplicateRoleNameException,
  ProtectedCapabilityRemovalException,
  RoleNotFoundException,
  RoleVersionConflictException,
} from '../exceptions/role.exceptions';
import { RoleStatus, RoleType, SystemRoleKey } from '../interfaces/system-role-template.interface';
import { RolePermissionRepository } from '../repositories/role-permission.repository';
import { RoleRepository } from '../repositories/role.repository';

@Injectable()
export class RoleApplicationService {
  private readonly logger = new Logger(RoleApplicationService.name);
  private readonly HIGH_IMPACT_THRESHOLD = 100;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly roleRepository: RoleRepository,
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly roleCacheService: RoleCacheService,
    private readonly permissionDependencyService: PermissionDependencyService,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
  ) {}

  async list(filters: FilterRoleDto): Promise<PaginatedResult<Role>> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 10;

    const paginatedResult = await this.roleRepository.find(filters, {
      pagination: { page, limit },
      relations: ['permissions'],
      order: {
        createdAt: 'ASC',
      },
    });

    const items: Role[] = [];

    for (const role of paginatedResult.data) {
      const { assignedUserGroupCount, activeUserReachCount } =
        await this.roleRepository.countAssignedUserGroupAndUser(role.id);

      items.push({ ...role, assignedUserGroupCount, activeUserReachCount });
    }

    return {
      ...paginatedResult,
      data: items,
    };
  }

  async getById(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findById(roleId, { required: true });

    const { assignedUserGroupCount, activeUserReachCount } =
      await this.roleRepository.countAssignedUserGroupAndUser(role.id);

    return { ...role, assignedUserGroupCount, activeUserReachCount };
  }

  async createCustom(dto: CreateCustomRoleDto): Promise<Role> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    // 1. Validate permissions against DAG dependency engine
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      const errorMessage = `Capability dependency validation failed: ${validation.errors.join('; ')}`;
      this.logger.error(errorMessage);
      throw new UnprocessableEntityException(errorMessage);
    }

    // 2. Validate role name uniqueness within tenant
    await this.validateRoleName(dto.name, tenantCode);

    const createdRole = await this.transactionService.runInTransaction(async () => {
      const role = Role.fromRequest(userId, dto);
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
      await this.rolePermissionRepository.bulkSave(rolePermissions);

      // Record outbox event
      const outbox = AuthSecurityEventOutbox.fromRoleCreated(
        { tenantCode, userId },
        { role: savedRole, permissionCodes: dto.permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      return savedRole;
    });

    // Synchronous Redis cache seeding
    await this.roleCacheService.syncRole(createdRole);

    return createdRole;
  }

  async copy(sourceRoleId: string, dto: CopyRoleDto): Promise<Role> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const sourceRole = await this.roleRepository.findById(sourceRoleId, {
      required: true,
      relations: ['permissions'],
    });
    await this.validateRoleName(dto.name, tenantCode);

    const permissionCodes = (sourceRole.permissions || []).map((p) => p.permissionCode);

    const clonedRole = await this.transactionService.runInTransaction(async () => {
      const role = Role.fromRequest(userId, {
        name: dto.name,
        description: dto.description ?? sourceRole.description,
      });

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
      await this.rolePermissionRepository.bulkSave(rolePermissions);

      // Record outbox event
      const outbox = AuthSecurityEventOutbox.fromRoleCopied(
        { tenantCode, userId },
        { role: savedRole, sourceRoleId, permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      return savedRole;
    });

    await this.roleCacheService.syncRole(clonedRole);

    return clonedRole;
  }

  async estimateImpact(roleId: string): Promise<[number, number]> {
    const role = await this.roleRepository.findById(roleId, { required: true });

    const { assignedUserGroupCount, activeUserReachCount } =
      await this.roleRepository.countAssignedUserGroupAndUser(role.id);

    return [assignedUserGroupCount, activeUserReachCount];
  }

  async updateCustom(
    id: string,
    dto: UpdateCustomRoleDto,
  ): Promise<Role | HighImpactConfirmationRequiredResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const role = await this.roleRepository.findById(id, { required: true });

    if (role.type === RoleType.SYSTEM) {
      this.logger.error(`Cannot mutate system role: ${role.name}`);
      throw new CannotMutateSystemRoleException(role.name);
    }

    // 1. Optimistic locking check
    if (dto.version !== undefined && role.version !== dto.version) {
      this.logger.error(
        `Role version conflict for role ${role.id}: expected ${dto.version}, current ${role.version}`,
      );
      throw new RoleVersionConflictException(role.id, dto.version, role.version);
    }

    // 2. Validate name uniqueness if changed
    if (role.name !== dto.name) {
      const existing = await this.roleRepository.findByName(dto.name);
      if (existing && existing.id !== role.id) {
        this.logger.error(`Duplicate role name '${dto.name}' in tenant '${tenantCode}'`);
        throw new DuplicateRoleNameException(dto.name);
      }
    }

    // 3. Capability dependency validation
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      const errorMessage = `Capability dependency validation failed: ${validation.errors.join('; ')}`;
      this.logger.error(errorMessage);
      throw new UnprocessableEntityException(errorMessage);
    }

    // 4. High-impact blast radius check
    const { assignedUserGroupCount, activeUserReachCount: affectedUserCount } =
      await this.roleRepository.countAssignedUserGroupAndUser(role.id);

    if (affectedUserCount >= this.HIGH_IMPACT_THRESHOLD && dto.confirmed !== true) {
      return this.responseForHighImpactUsersConfirmation(affectedUserCount);
    }

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(id, {
        lock: { mode: 'pessimistic_write' },
        required: true,
      });

      if (dto.version !== undefined && lockedRole.version !== dto.version) {
        this.logger.error(
          `Role version conflict under pessimistic lock for role ${lockedRole.id}: expected ${dto.version}, current ${lockedRole.version}`,
        );
        throw new RoleVersionConflictException(lockedRole.id, dto.version, lockedRole.version);
      }

      lockedRole.name = dto.name;
      lockedRole.description = dto.description;
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
      await this.rolePermissionRepository.bulkSave(newRolePermissions);

      const savedRole = await this.roleRepository.save(lockedRole);
      const outbox = AuthSecurityEventOutbox.fromPermissionsUpdated(
        { tenantCode, userId },
        { role: savedRole, permissionCodes: dto.permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      return savedRole;
    });

    await this.roleCacheService.syncRole(updatedRole);

    return {
      ...updatedRole,
      assignedUserGroupCount,
      activeUserReachCount: affectedUserCount,
    };
  }

  async deactivate(
    id: string,
    dto?: DeactivateRoleDto,
  ): Promise<Role | HighImpactConfirmationRequiredResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const role = await this.roleRepository.findById(id, { required: true });
    if (role.type === RoleType.SYSTEM && role.systemRoleKey === SystemRoleKey.ADMINISTRATOR) {
      this.logger.error(`Cannot deactivate critical system role: ${role.name}`);
      throw new CriticalRoleDeactivationException(role.name);
    }

    if (dto?.version !== undefined && role.version !== dto.version) {
      this.logger.error(
        `Role version conflict for role ${role.id}: expected ${dto.version}, current ${role.version}`,
      );
      throw new RoleVersionConflictException(role.id, dto.version, role.version);
    }

    const { assignedUserGroupCount, activeUserReachCount } =
      await this.roleRepository.countAssignedUserGroupAndUser(role.id);

    if (assignedUserGroupCount > 0 && !dto?.confirmed) {
      return this.responseForHighImpactUserGroupsConfirmation(
        assignedUserGroupCount,
        activeUserReachCount,
      );
    }

    const deactivatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(id, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRole) {
        this.logger.error(`Role not found under pessimistic lock: ${id}`);
        throw new RoleNotFoundException(id);
      }

      if (dto?.version !== undefined && lockedRole.version !== dto.version) {
        this.logger.error(
          `Role version conflict under pessimistic lock for role ${lockedRole.id}: expected ${dto.version}, current ${lockedRole.version}`,
        );
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
          affectedUserGroupCount: assignedUserGroupCount,
          affectedUserCount: activeUserReachCount,
        },
      );
      await this.outboxRepository.save(outbox);

      return saved;
    });

    await this.roleCacheService.syncRole(deactivatedRole);

    return {
      ...deactivatedRole,
      assignedUserGroupCount: assignedUserGroupCount,
      activeUserReachCount: activeUserReachCount,
    };
  }

  async reactivate(id: string): Promise<Role> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    await this.roleRepository.findById(id, { required: true });

    const reactivatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(id, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRole) {
        this.logger.error(`Role not found under pessimistic lock: ${id}`);
        throw new RoleNotFoundException(id);
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

    const { assignedUserGroupCount, activeUserReachCount } =
      await this.roleRepository.countAssignedUserGroupAndUser(reactivatedRole.id);

    return {
      ...reactivatedRole,
      assignedUserGroupCount,
      activeUserReachCount,
    };
  }

  async rename(roleId: string, dto: RenameRoleDto): Promise<Role> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
        required: true,
      });
      if (role.name === dto.name) {
        return role;
      }

      await this.validateRoleName(dto.name, tenantCode);

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

    return updatedRole;
  }

  async updatePermissions(
    id: string,
    dto: { permissionCodes: string[]; version?: number; confirmed?: boolean },
  ): Promise<Role | HighImpactConfirmationRequiredResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const role = await this.roleRepository.findById(id, {
      required: true,
    });

    // 1. Optimistic locking check
    if (dto.version !== undefined && role.version !== dto.version) {
      this.logger.error(
        `Role version conflict for role ${role.id}: expected ${dto.version}, current ${role.version}`,
      );
      throw new RoleVersionConflictException(role.id, dto.version, role.version);
    }

    // 2. Check System Role protected capabilities inviolability
    if (role.type === RoleType.SYSTEM && role.systemRoleKey) {
      const template = SYSTEM_ROLE_TEMPLATES[role.systemRoleKey];
      if (template) {
        const requiredProtectedCodes = template.permissions
          .filter((p) => p.isProtected)
          .map((p) => p.code);
        const omittedProtected = requiredProtectedCodes.filter(
          (code) => !dto.permissionCodes.includes(code),
        );
        if (omittedProtected.length > 0) {
          this.logger.error(
            `Attempt to remove protected capabilities [${omittedProtected.join(', ')}] from system role '${role.name}'`,
          );
          throw new ProtectedCapabilityRemovalException(role.name, omittedProtected);
        }
      }
    }

    // 3. Capability dependency validation
    const validation = this.permissionDependencyService.validatePermissionSet(dto.permissionCodes);
    if (!validation.isValid) {
      const errorMessage = `Capability dependency validation failed: ${validation.errors.join('; ')}`;
      this.logger.error(errorMessage);
      throw new UnprocessableEntityException(errorMessage);
    }

    // 4. High-impact blast radius check
    const affectedUserCount = await this.roleRepository.countActiveUserReach(id);
    if (affectedUserCount >= this.HIGH_IMPACT_THRESHOLD && dto.confirmed !== true) {
      return this.responseForHighImpactUsersConfirmation(affectedUserCount);
    }

    const updatedRole = await this.transactionService.runInTransaction(async () => {
      const lockedRole = await this.roleRepository.findById(id, {
        lock: { mode: 'pessimistic_write' },
        required: true,
      });

      if (dto.version !== undefined && lockedRole.version !== dto.version) {
        this.logger.error(
          `Role version conflict under pessimistic lock for role ${lockedRole.id}: expected ${dto.version}, current ${lockedRole.version}`,
        );
        throw new RoleVersionConflictException(lockedRole.id, dto.version, lockedRole.version);
      }

      lockedRole.version += 1;
      lockedRole.updatedBy = userId;

      await this.rolePermissionRepository.deleteByRoleId(lockedRole.id);

      const isSystemRole = lockedRole.type === RoleType.SYSTEM && lockedRole.systemRoleKey;
      const systemTemplate = isSystemRole ? SYSTEM_ROLE_TEMPLATES[lockedRole.systemRoleKey!] : null;
      const protectedSet = new Set(
        systemTemplate
          ? systemTemplate.permissions.filter((p) => p.isProtected).map((p) => p.code)
          : [],
      );

      const newRolePermissions = dto.permissionCodes.map((code) => {
        const rp = new RolePermission();
        rp.tenantCode = tenantCode;
        rp.roleId = lockedRole.id;
        rp.permissionCode = code;
        rp.isProtected = protectedSet.has(code);
        return rp;
      });
      await this.rolePermissionRepository.bulkSave(newRolePermissions);

      const savedRole = await this.roleRepository.save(lockedRole);
      const outbox = AuthSecurityEventOutbox.fromPermissionsUpdated(
        { tenantCode, userId },
        { role: savedRole, permissionCodes: dto.permissionCodes },
      );
      await this.outboxRepository.save(outbox);

      return savedRole;
    });

    // Synchronous Redis runtime cache update
    await this.roleCacheService.syncRole(updatedRole);

    const assignedUserGroupCount = await this.roleRepository.countAssignedUserGroups(
      updatedRole.id,
    );

    return {
      ...updatedRole,
      assignedUserGroupCount,
      activeUserReachCount: affectedUserCount,
    };
  }

  async delete(roleId: string): Promise<void> {
    await this.transactionService.runInTransaction(async () => {
      const role = await this.roleRepository.findById(roleId, {
        lock: { mode: 'pessimistic_write' },
      });
      if (!role) {
        this.logger.error(`Role not found: ${roleId}`);
        throw new RoleNotFoundException(roleId);
      }

      if (role.type === RoleType.SYSTEM) {
        this.logger.error(`Cannot delete system role: ${role.name} (${role.id})`);
        throw new CannotDeleteSystemRoleException(role.id, role.name);
      }

      await this.rolePermissionRepository.deleteByRoleId(role.id);
      await this.roleRepository.delete(role.id);
    });

    const tenantCode = RequestContextService.getTenantCode();
    await this.roleCacheService.invalidateRole(tenantCode, roleId);
  }

  private async validateRoleName(name: string, tenantCode: string): Promise<void> {
    const existingRole = await this.roleRepository.findByName(name);
    if (existingRole) {
      this.logger.error(`Duplicate role name '${name}' in tenant '${tenantCode}'`);
      throw new DuplicateRoleNameException(name);
    }
  }

  private responseForHighImpactUsersConfirmation(
    affectedUserCount: number,
  ): HighImpactConfirmationRequiredResponseDto {
    return {
      confirmationRequired: true,
      affectedUserCount,
      message: `This role change affects ${affectedUserCount} users. Explicit confirmation is required.`,
    };
  }

  private responseForHighImpactUserGroupsConfirmation(
    affectedUserGroupCount: number,
    affectedUserCount: number,
  ): HighImpactConfirmationRequiredResponseDto {
    return {
      confirmationRequired: true,
      affectedUserGroupCount,
      affectedUserCount,
      message: `This role change affects ${affectedUserGroupCount} User Group(s) and ${affectedUserCount} user(s). Explicit confirmation is required.`,
    };
  }
}
