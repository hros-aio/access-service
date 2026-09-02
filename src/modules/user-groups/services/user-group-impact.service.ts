import { Injectable, Logger } from '@nestjs/common';

import { ScopeType } from '../domain/enums/scope-type.enum';
import { UserGroupScopeValidator } from '../domain/validators/user-group-scope.validator';
import { RoleAssignmentImpactEstimateDto } from '../dto/estimate-role-assignment-impact.dto';
import { ScopeImpactEstimateDto } from '../dto/scope-impact-estimate.dto';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

export const HIGH_IMPACT_ROLE_ASSIGNMENT_THRESHOLD = 100;
export const HIGH_IMPACT_SCOPE_THRESHOLD = 100;

@Injectable()
export class UserGroupImpactService {
  private readonly logger = new Logger(UserGroupImpactService.name);

  constructor(
    private readonly userGroupRepository: UserGroupRepository,
    private readonly userGroupRoleRepository: UserGroupRoleRepository,
    private readonly userGroupMembershipRepository: UserGroupMembershipRepository,
  ) {}

  async estimateRoleAssignmentImpact(
    userGroupId: string,
    targetRoleIds: string[],
    threshold = HIGH_IMPACT_ROLE_ASSIGNMENT_THRESHOLD,
  ): Promise<RoleAssignmentImpactEstimateDto> {
    const existingGroup = await this.userGroupRepository.findById(userGroupId);
    if (!existingGroup) {
      this.logger.warn(`User group not found for impact estimation: ${userGroupId}`);
      return {
        affectedUserCount: 0,
        zeroRoleUserCount: 0,
        requiresConfirmation: false,
        threshold,
      };
    }

    const currentRoleIds = await this.userGroupRoleRepository.findRoleIdsByGroupId(userGroupId);

    const targetSet = new Set(targetRoleIds);
    const currentSet = new Set(currentRoleIds);

    const addedRoleIds = targetRoleIds.filter((id) => !currentSet.has(id));
    const removedRoleIds = currentRoleIds.filter((id) => !targetSet.has(id));

    // If no role differences, blast radius is 0
    if (addedRoleIds.length === 0 && removedRoleIds.length === 0) {
      return {
        affectedUserCount: 0,
        zeroRoleUserCount: 0,
        requiresConfirmation: false,
        threshold,
      };
    }

    // Query materialized members of this user group
    const affectedUserCount =
      await this.userGroupMembershipRepository.countMemberEmployeeIdsByGroup(userGroupId);

    let zeroRoleUserCount = 0;
    if (removedRoleIds.length > 0 && affectedUserCount > 0) {
      zeroRoleUserCount =
        await this.userGroupMembershipRepository.countZeroRoleMembersAfterUnassign(
          userGroupId,
          targetRoleIds.length,
        );
    }

    const requiresConfirmation = affectedUserCount >= threshold;

    return {
      affectedUserCount,
      zeroRoleUserCount,
      requiresConfirmation,
      threshold,
    };
  }

  async estimateScopeImpact(
    userGroupId: string,
    proposedScopeType: ScopeType | string,
    proposedScopeRefId?: string | null,
    threshold = HIGH_IMPACT_SCOPE_THRESHOLD,
  ): Promise<ScopeImpactEstimateDto> {
    const group = await this.userGroupRepository.findById(userGroupId, { required: true });

    // Validate proposed scope parameters
    const validated = UserGroupScopeValidator.validate(proposedScopeType, proposedScopeRefId);

    const affectedUserCount = await this.userGroupMembershipRepository.countByGroup(userGroupId);
    const requiresConfirmation = affectedUserCount >= threshold;

    return {
      userGroupId,
      affectedUserCount,
      threshold,
      requiresConfirmation,
      currentScope: {
        scopeType: group.scopeType,
        scopeRefId: group.scopeRefId ?? null,
      },
      proposedScope: {
        scopeType: validated.scopeType,
        scopeRefId: validated.scopeRefId,
      },
    };
  }
}
