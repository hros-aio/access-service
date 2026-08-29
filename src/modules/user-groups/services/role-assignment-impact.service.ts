import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { RoleAssignmentImpactEstimateDto } from '../dto/estimate-role-assignment-impact.dto';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

export const HIGH_IMPACT_ROLE_ASSIGNMENT_THRESHOLD = 100;

@Injectable()
export class RoleAssignmentImpactService {
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
    const tenantCode = RequestContextService.getTenantCode();

    const existingGroup = await this.userGroupRepository.findByTenantAndId(tenantCode, userGroupId);
    if (!existingGroup) {
      return {
        affectedUserCount: 0,
        zeroRoleUserCount: 0,
        requiresConfirmation: false,
        threshold,
      };
    }

    const currentRoles = await this.userGroupRoleRepository.findByGroup(tenantCode, userGroupId);
    const currentRoleIds = currentRoles.map((r) => r.roleId);

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
    const memberEmployeeIds = await this.userGroupMembershipRepository.findMemberEmployeeIdsByGroup(
      tenantCode,
      userGroupId,
    );

    const affectedUserCount = memberEmployeeIds.length;

    let zeroRoleUserCount = 0;
    if (removedRoleIds.length > 0 && affectedUserCount > 0) {
      zeroRoleUserCount =
        await this.userGroupMembershipRepository.countZeroRoleMembersAfterUnassign(
          tenantCode,
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
}
