import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { UserGroupAggregate } from '../domain/aggregates/user-group.aggregate';
import {
  ConcurrentModificationError,
  DuplicateUserGroupNameError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';
import { CreateUserGroupDto, UpdateUserGroupDto } from '../dto';
import { UserGroupRole } from '../entities/user-group-role.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupLifecycleService {
  private readonly logger = new Logger(UserGroupLifecycleService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepository: UserGroupRepository,
    private readonly userGroupRoleRepository: UserGroupRoleRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
  ) {}

  private getActiveTenantCode(): string {
    return RequestContextService.getTenantCode() || '';
  }

  private getActiveUserId(): string {
    return RequestContextService.getUser()?.userId ?? 'SYSTEM';
  }

  async createUserGroup(dto: CreateUserGroupDto): Promise<UserGroup> {
    const tenantCode = this.getActiveTenantCode();
    const userId = this.getActiveUserId();

    const existing = await this.userGroupRepository.findByTenantAndName(
      tenantCode,
      dto.name.trim(),
    );
    if (existing) {
      throw new DuplicateUserGroupNameError(dto.name.trim());
    }

    const aggregate = UserGroupAggregate.create({
      tenantCode,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      scopeType: dto.scopeType,
      scopeRefId: dto.scopeRefId?.trim(),
      matchingRule: dto.matchingRule,
      assignedRoleIds: dto.roleIds ?? [],
      createdBy: userId,
      updatedBy: userId,
    });

    return this.transactionService.runInTransaction(async () => {
      const entity = new UserGroup();
      entity.tenantCode = aggregate.tenantCode;
      entity.name = aggregate.name;
      entity.description = aggregate.description;
      entity.status = aggregate.status;
      entity.scopeType = aggregate.scopeType;
      entity.scopeRefId = aggregate.scopeRefId;
      entity.matchingRule = aggregate.matchingRule;
      entity.ruleAttributeKeys = aggregate.ruleAttributeKeys;
      entity.version = aggregate.version;
      entity.projectionVersion = aggregate.projectionVersion;
      entity.createdBy = aggregate.createdBy;
      entity.updatedBy = aggregate.updatedBy;

      const savedGroup = await this.userGroupRepository.create(entity);

      const roleIds = dto.roleIds ?? [];
      const groupRolesToSave = roleIds.map((roleId) => {
        const ugr = new UserGroupRole();
        ugr.tenantCode = tenantCode;
        ugr.userGroupId = savedGroup.id;
        ugr.roleId = roleId;
        return ugr;
      });

      if (groupRolesToSave.length > 0) {
        await this.userGroupRoleRepository.bulkSave(groupRolesToSave);
      }

      // Outbox events
      const outboxContext = { tenantCode, userId };
      const createdOutbox = AuthSecurityEventOutbox.fromUserGroupCreated(outboxContext, {
        userGroup: savedGroup,
        roleIds,
      });
      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
      });

      await this.outboxRepository.save(createdOutbox);
      await this.outboxRepository.save(syncOutbox);

      return (await this.userGroupRepository.findByTenantAndId(tenantCode, savedGroup.id))!;
    });
  }

  async updateUserGroup(
    id: string,
    dto: UpdateUserGroupDto,
    expectedVersion: number,
  ): Promise<UserGroup> {
    const tenantCode = this.getActiveTenantCode();
    const userId = this.getActiveUserId();

    const existing = await this.userGroupRepository.findByTenantAndId(tenantCode, id);
    if (!existing) {
      throw new UserGroupNotFoundError(id);
    }

    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    if (dto.name.trim() !== existing.name) {
      const nameConflict = await this.userGroupRepository.findByTenantAndName(
        tenantCode,
        dto.name.trim(),
      );
      if (nameConflict && nameConflict.id !== id) {
        throw new DuplicateUserGroupNameError(dto.name.trim());
      }
    }

    const { ruleAttributeKeys } = MatchingRuleValidator.validate(dto.matchingRule);

    return this.transactionService.runInTransaction(async () => {
      existing.name = dto.name.trim();
      existing.description = dto.description?.trim();
      existing.scopeType = dto.scopeType;
      existing.scopeRefId = dto.scopeRefId?.trim();
      existing.matchingRule = dto.matchingRule;
      existing.ruleAttributeKeys = ruleAttributeKeys;
      existing.version = existing.version + 1;
      existing.updatedBy = userId;

      const savedGroup = await this.userGroupRepository.save(existing);

      // Handle role synchronization
      const currentRoleIds = (existing.groupRoles ?? []).map((r) => r.roleId);
      const newRoleIds = dto.roleIds ?? [];

      const addedRoleIds = newRoleIds.filter((r) => !currentRoleIds.includes(r));
      const removedRoleIds = currentRoleIds.filter((r) => !newRoleIds.includes(r));

      if (removedRoleIds.length > 0) {
        await this.userGroupRoleRepository['repository']
          .createQueryBuilder()
          .delete()
          .where(
            'tenantCode = :tenantCode AND userGroupId = :userGroupId AND roleId IN (:...roleIds)',
            {
              tenantCode,
              userGroupId: id,
              roleIds: removedRoleIds,
            },
          )
          .execute();
      }

      if (addedRoleIds.length > 0) {
        const addedRoles = addedRoleIds.map((roleId) => {
          const ugr = new UserGroupRole();
          ugr.tenantCode = tenantCode;
          ugr.userGroupId = id;
          ugr.roleId = roleId;
          return ugr;
        });
        await this.userGroupRoleRepository.bulkSave(addedRoles);
      }

      // Outbox events
      const outboxContext = { tenantCode, userId };
      const updatedOutbox = AuthSecurityEventOutbox.fromUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
        addedRoleIds,
        removedRoleIds,
      });
      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
      });

      await this.outboxRepository.save(updatedOutbox);
      await this.outboxRepository.save(syncOutbox);

      return (await this.userGroupRepository.findByTenantAndId(tenantCode, id))!;
    });
  }

  async deactivateUserGroup(id: string, expectedVersion: number): Promise<UserGroup> {
    const tenantCode = this.getActiveTenantCode();
    const userId = this.getActiveUserId();

    const existing = await this.userGroupRepository.findByTenantAndId(tenantCode, id);
    if (!existing) {
      throw new UserGroupNotFoundError(id);
    }

    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    const aggregate = UserGroupAggregate.reconstruct({
      id: existing.id,
      tenantCode: existing.tenantCode,
      name: existing.name,
      description: existing.description,
      status: existing.status,
      scopeType: existing.scopeType,
      scopeRefId: existing.scopeRefId,
      matchingRule: existing.matchingRule,
      ruleAttributeKeys: existing.ruleAttributeKeys,
      version: existing.version,
      projectionVersion: existing.projectionVersion,
    });

    aggregate.deactivate(userId);

    return this.transactionService.runInTransaction(async () => {
      existing.status = aggregate.status;
      existing.version = aggregate.version;
      existing.updatedBy = aggregate.updatedBy;

      const savedGroup = await this.userGroupRepository.save(existing);

      const outboxContext = { tenantCode, userId };
      const deactivatedOutbox = AuthSecurityEventOutbox.fromUserGroupDeactivated(outboxContext, {
        userGroup: savedGroup,
      });
      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
      });

      await this.outboxRepository.save(deactivatedOutbox);
      await this.outboxRepository.save(syncOutbox);

      return (await this.userGroupRepository.findByTenantAndId(tenantCode, id))!;
    });
  }

  async reactivateUserGroup(id: string, expectedVersion: number): Promise<UserGroup> {
    const tenantCode = this.getActiveTenantCode();
    const userId = this.getActiveUserId();

    const existing = await this.userGroupRepository.findByTenantAndId(tenantCode, id);
    if (!existing) {
      throw new UserGroupNotFoundError(id);
    }

    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    const aggregate = UserGroupAggregate.reconstruct({
      id: existing.id,
      tenantCode: existing.tenantCode,
      name: existing.name,
      description: existing.description,
      status: existing.status,
      scopeType: existing.scopeType,
      scopeRefId: existing.scopeRefId,
      matchingRule: existing.matchingRule,
      ruleAttributeKeys: existing.ruleAttributeKeys,
      version: existing.version,
      projectionVersion: existing.projectionVersion,
    });

    aggregate.reactivate(userId);

    return this.transactionService.runInTransaction(async () => {
      existing.status = aggregate.status;
      existing.version = aggregate.version;
      existing.updatedBy = aggregate.updatedBy;

      const savedGroup = await this.userGroupRepository.save(existing);

      const outboxContext = { tenantCode, userId };
      const reactivatedOutbox = AuthSecurityEventOutbox.fromUserGroupReactivated(outboxContext, {
        userGroup: savedGroup,
      });
      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
      });

      await this.outboxRepository.save(reactivatedOutbox);
      await this.outboxRepository.save(syncOutbox);

      return (await this.userGroupRepository.findByTenantAndId(tenantCode, id))!;
    });
  }
}
