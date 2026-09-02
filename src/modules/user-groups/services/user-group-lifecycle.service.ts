import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { UserGroupAggregate } from '../domain/aggregates/user-group.aggregate';
import {
  ConcurrentModificationError,
  DuplicateUserGroupNameError,
  HighImpactConfirmationRequiredError,
} from '../domain/exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';
import { CreateUserGroupDto, UpdateUserGroupDto } from '../dto';
import { UserGroupImpactService } from './user-group-impact.service';
import { UserGroupRole } from '../entities/user-group-role.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupLifecycleService {
  private readonly logger = new Logger(UserGroupLifecycleService.name);
  private readonly HIGH_IMPACT_THRESHOLD = 100;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepository: UserGroupRepository,
    private readonly userGroupRoleRepository: UserGroupRoleRepository,
    private readonly userGroupMembershipRepository: UserGroupMembershipRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
    private readonly userGroupImpactService: UserGroupImpactService,
  ) {}

  async create(dto: CreateUserGroupDto): Promise<UserGroup> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    await this.validateName(dto.name, tenantCode);

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
      const entity = UserGroup.fromAggregate(aggregate);
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

      return savedGroup;
    });
  }

  async updateById(
    id: string,
    dto: UpdateUserGroupDto,
    expectedVersion: number,
  ): Promise<UserGroup> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const existing = await this.userGroupRepository.findById(id, {
      required: true,
      relations: ['groupRoles'],
    });
    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    if (dto.name.trim() !== existing.name) {
      const nameConflict = await this.userGroupRepository.findByName(dto.name.trim());
      if (nameConflict && nameConflict.id !== id) {
        throw new DuplicateUserGroupNameError(dto.name.trim());
      }
    }

    const { ruleAttributeKeys } = MatchingRuleValidator.validate(dto.matchingRule);

    // Impact blast radius check
    const currentMemberCount = await this.userGroupMembershipRepository.countByGroup(id);
    if (currentMemberCount >= this.HIGH_IMPACT_THRESHOLD && dto.confirmed !== true) {
      throw new HighImpactConfirmationRequiredError({
        affectedUserCount: currentMemberCount,
        threshold: this.HIGH_IMPACT_THRESHOLD,
      });
    }

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
        await this.userGroupRoleRepository.batchDelete(id, removedRoleIds);
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

      return savedGroup;
    });
  }

  async deactivate(id: string, expectedVersion: number, confirmed = false): Promise<UserGroup> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const existing = await this.userGroupRepository.findById(id, { required: true });
    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    const memberCount = await this.userGroupMembershipRepository.countByGroup(id);
    if (memberCount >= this.HIGH_IMPACT_THRESHOLD && !confirmed) {
      throw new HighImpactConfirmationRequiredError({
        affectedUserCount: memberCount,
        threshold: this.HIGH_IMPACT_THRESHOLD,
      });
    }

    const aggregate = UserGroupAggregate.reconstruct(existing);
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

      return savedGroup;
    });
  }

  async reactivate(id: string, expectedVersion: number): Promise<UserGroup> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const existing = await this.userGroupRepository.findById(id, { required: true });
    if (existing.version !== expectedVersion) {
      throw new ConcurrentModificationError();
    }

    const aggregate = UserGroupAggregate.reconstruct(existing);
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

      return (await this.userGroupRepository.findFullyById(id))!;
    });
  }

  private async validateName(name: string, tenantCode: string): Promise<void> {
    const existing = await this.userGroupRepository.findByName(name.trim());
    if (existing) {
      this.logger.warn(`Duplicate user group name detected for tenant ${tenantCode}: ${name}`);
      throw new DuplicateUserGroupNameError(name.trim());
    }
  }
}
