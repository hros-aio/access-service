import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupImpactService } from './user-group-impact.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupAggregate } from '../domain/aggregates/user-group.aggregate';
import {
  ConcurrentModificationError,
  HighImpactConfirmationRequiredError,
  InvalidRoleAssignmentError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { AssignedRoleItemDto } from '../dto/assigned-role-item.dto';
import { UpdateUserGroupRolesDto } from '../dto/update-user-group-roles.dto';
import { UserGroupRole } from '../entities/user-group-role.entity';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupRoleAssignmentService {
  private readonly logger = new Logger(UserGroupRoleAssignmentService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepository: UserGroupRepository,
    private readonly userGroupRoleRepository: UserGroupRoleRepository,
    private readonly roleRepository: RoleRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
    private readonly impactService: UserGroupImpactService,
  ) {}

  async getAssignedRoles(userGroupId: string): Promise<AssignedRoleItemDto[]> {
    const tenantCode = RequestContextService.getTenantCode();

    const group = await this.userGroupRepository.findByTenantAndId(tenantCode, userGroupId);
    if (!group) {
      throw new UserGroupNotFoundError(userGroupId);
    }

    const groupRoles = await this.userGroupRoleRepository.findByGroup(tenantCode, userGroupId);
    return groupRoles
      .filter((gr) => !!gr.role)
      .map((gr) => AssignedRoleItemDto.fromUserGroupRole(gr));
  }

  async updateRoleAssignments(
    userGroupId: string,
    dto: UpdateUserGroupRolesDto,
  ): Promise<AssignedRoleItemDto[]> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const existingGroup = await this.userGroupRepository.findByTenantAndId(tenantCode, userGroupId);
    if (!existingGroup) {
      throw new UserGroupNotFoundError(userGroupId);
    }

    if (existingGroup.version !== dto.expectedVersion) {
      throw new ConcurrentModificationError();
    }

    // Validate target roles existence, status, and tenant scoping
    const targetRoleIds = Array.from(new Set(dto.roleIds));
    for (const roleId of targetRoleIds) {
      const role = await this.roleRepository.findById(roleId, { required: true });
      if (role.status !== 'ACTIVE') {
        throw new InvalidRoleAssignmentError(
          `Role "${role.name}" (${roleId}) is inactive and cannot be assigned to a User Group`,
        );
      }
    }

    // Impact blast radius estimation and confirmation check
    const impact = await this.impactService.estimateRoleAssignmentImpact(
      userGroupId,
      targetRoleIds,
    );

    if (impact.requiresConfirmation && dto.confirmed !== true) {
      throw new HighImpactConfirmationRequiredError({
        affectedUserCount: impact.affectedUserCount,
        zeroRoleUserCount: impact.zeroRoleUserCount,
        threshold: impact.threshold,
      });
    }

    const currentRoles = await this.userGroupRoleRepository.findByGroup(tenantCode, userGroupId);
    const currentRoleIds = currentRoles.map((r) => r.roleId);

    const aggregate = UserGroupAggregate.reconstruct({
      id: existingGroup.id,
      tenantCode: existingGroup.tenantCode,
      name: existingGroup.name,
      description: existingGroup.description,
      status: existingGroup.status,
      scopeType: existingGroup.scopeType,
      scopeRefId: existingGroup.scopeRefId,
      matchingRule: existingGroup.matchingRule,
      ruleAttributeKeys: existingGroup.ruleAttributeKeys,
      version: existingGroup.version,
      projectionVersion: existingGroup.projectionVersion,
      assignedRoleIds: currentRoleIds,
    });

    const { addedRoleIds, removedRoleIds } = aggregate.replaceRoles(targetRoleIds, userId);

    return this.transactionService.runInTransaction(async () => {
      existingGroup.version = aggregate.version;
      existingGroup.updatedBy = aggregate.updatedBy;

      const savedGroup = await this.userGroupRepository.save(existingGroup);

      if (removedRoleIds.length > 0) {
        await this.userGroupRoleRepository.batchDelete(tenantCode, userGroupId, removedRoleIds);
      }

      if (addedRoleIds.length > 0) {
        const addedEntities = addedRoleIds.map((roleId) => {
          const ugr = new UserGroupRole();
          ugr.tenantCode = tenantCode;
          ugr.userGroupId = userGroupId;
          ugr.roleId = roleId;
          return ugr;
        });
        await this.userGroupRoleRepository.bulkSave(addedEntities);
      }

      // Persist Audit and Domain events into Transactional Outbox
      const outboxContext = { tenantCode, userId };

      if (addedRoleIds.length > 0) {
        const rolesAssignedOutbox = AuthSecurityEventOutbox.fromUserGroupRolesAssigned(
          outboxContext,
          {
            userGroup: savedGroup,
            assignedRoleIds: targetRoleIds,
            addedRoleIds,
            previousRoleIds: currentRoleIds,
          },
        );
        await this.outboxRepository.save(rolesAssignedOutbox);
      }

      if (removedRoleIds.length > 0) {
        const roleUnassignedOutbox = AuthSecurityEventOutbox.fromUserGroupRoleUnassigned(
          outboxContext,
          {
            userGroup: savedGroup,
            assignedRoleIds: targetRoleIds,
            removedRoleIds,
            previousRoleIds: currentRoleIds,
          },
        );
        await this.outboxRepository.save(roleUnassignedOutbox);
      }

      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
        isUrgent: removedRoleIds.length > 0,
      });
      await this.outboxRepository.save(syncOutbox);

      return this.getAssignedRoles(userGroupId);
    });
  }
}
