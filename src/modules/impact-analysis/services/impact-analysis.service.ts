import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { RoleRepository } from '../../roles/repositories/role.repository';
import { MatchingRuleValidator } from '../../user-groups/domain/validators/matching-rule.validator';
import { UserGroupScopeValidator } from '../../user-groups/domain/validators/user-group-scope.validator';
import { UserEffectiveRoleRepository } from '../../user-groups/repositories/user-effective-role.repository';
import { UserGroupMembershipRepository } from '../../user-groups/repositories/user-group-membership.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { UserGroupPopulationQueryService } from '../../user-groups/services/user-group-population-query.service';
import { PreviewRoleImpactDto, PreviewUserGroupImpactDto } from '../dto';
import {
  DEFAULT_HIGH_IMPACT_THRESHOLD,
  CoverageLossWarning,
  ImpactAnalysisResult,
  ImpactEstimate,
} from '../interfaces/impact-analysis.interface';

@Injectable()
export class ImpactAnalysisService {
  private readonly logger = new Logger(ImpactAnalysisService.name);

  constructor(
    private readonly roleRepo: RoleRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly userGroupMembershipRepo: UserGroupMembershipRepository,
    private readonly userEffectiveRoleRepo: UserEffectiveRoleRepository,
    private readonly populationQueryService: UserGroupPopulationQueryService,
  ) {}

  /**
   * Evaluates impact preview for a role modification or deactivation.
   */
  async previewRoleImpact(
    roleId: string,
    dto: PreviewRoleImpactDto,
    threshold = DEFAULT_HIGH_IMPACT_THRESHOLD,
  ): Promise<ImpactAnalysisResult> {
    const tenantCode = RequestContextService.getTenantCode();

    const role = await this.roleRepo.findById(roleId);
    if (!role || role.tenantCode !== tenantCode) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const reachCount = await this.roleRepo.countActiveUserReach(roleId, tenantCode);
    const coverageLoss = await this.checkCriticalCapabilityCoverageLoss(tenantCode, roleId);

    const estimate: ImpactEstimate = {
      usersGaining: 0,
      usersLosing: dto.status === 'INACTIVE' ? reachCount : 0,
      totalAffected: reachCount,
      isHighImpact: reachCount >= threshold,
      threshold,
      isEstimated: false,
    };

    return {
      targetType: 'ROLE',
      targetId: roleId,
      estimate,
      coverageLoss,
      requiresConfirmation: estimate.isHighImpact,
    };
  }

  /**
   * Evaluates impact preview for a user group modification.
   */
  async previewUserGroupImpact(
    userGroupId: string,
    dto: PreviewUserGroupImpactDto,
    threshold = DEFAULT_HIGH_IMPACT_THRESHOLD,
  ): Promise<ImpactAnalysisResult> {
    const tenantCode = RequestContextService.getTenantCode();

    const group = await this.userGroupRepo.findByTenantAndId(tenantCode, userGroupId);
    if (!group) {
      throw new NotFoundException(`User group with ID ${userGroupId} not found`);
    }

    if (dto.matchingRule) {
      MatchingRuleValidator.validate(dto.matchingRule);
    }

    if (dto.scopeType) {
      UserGroupScopeValidator.validate(dto.scopeType, dto.scopeRefId);
    }

    let usersGaining = 0;
    let usersLosing = 0;
    let totalAffected = 0;

    if (dto.matchingRule) {
      const diff = await this.populationQueryService.estimateCriteriaDiff(
        tenantCode,
        userGroupId,
        dto.matchingRule,
      );
      usersGaining = diff.gainingCount;
      usersLosing = diff.losingCount;
      totalAffected = diff.gainingCount + diff.losingCount;
    } else {
      const memberCount = await this.userGroupMembershipRepo.countUserGroupMembers(
        tenantCode,
        userGroupId,
      );
      totalAffected = memberCount;
      if (dto.status === 'INACTIVE') {
        usersLosing = memberCount;
      }
    }

    const coverageLoss = await this.checkCriticalCapabilityCoverageLoss(
      tenantCode,
      undefined,
      userGroupId,
    );

    const estimate: ImpactEstimate = {
      usersGaining,
      usersLosing,
      totalAffected,
      isHighImpact: totalAffected >= threshold,
      threshold,
      isEstimated: false,
    };

    return {
      targetType: 'USER_GROUP',
      targetId: userGroupId,
      estimate,
      coverageLoss,
      requiresConfirmation: estimate.isHighImpact,
    };
  }

  /**
   * Detects single-holder coverage loss for critical built-in administrative capabilities.
   */
  async checkCriticalCapabilityCoverageLoss(
    tenantCode: string,
    targetRoleId?: string,
    userGroupIdToRemove?: string,
  ): Promise<CoverageLossWarning | null> {
    // 1. Fetch active built-in admin roles via RoleRepository
    const adminRoles = await this.roleRepo.findActiveBuiltInAdminRoles(tenantCode);

    if (!adminRoles || adminRoles.length === 0) {
      return null;
    }

    for (const adminRole of adminRoles) {
      const priorHoldersCount = await this.userEffectiveRoleRepo.countActiveHoldersByRoleId(
        tenantCode,
        adminRole.id,
      );

      // If targetRoleId is deactivating the admin role
      if (targetRoleId && targetRoleId === adminRole.id && priorHoldersCount > 0) {
        return {
          capabilityCode: adminRole.systemRoleKey || adminRole.name,
          priorHoldersCount,
          projectedHoldersCount: 0,
          isCriticalLoss: true,
        };
      }

      // If userGroupIdToRemove is being removed or deactivated
      if (userGroupIdToRemove && priorHoldersCount > 0) {
        const projectedHoldersCount =
          await this.userEffectiveRoleRepo.countActiveHoldersExcludingSourceGroup(
            tenantCode,
            adminRole.id,
            userGroupIdToRemove,
          );

        if (projectedHoldersCount === 0 && priorHoldersCount > 0) {
          return {
            capabilityCode: adminRole.systemRoleKey || adminRole.name,
            priorHoldersCount,
            projectedHoldersCount: 0,
            isCriticalLoss: true,
          };
        }
      }
    }

    return null;
  }

  /**
   * Checks if an operation is high impact.
   */
  isHighImpact(totalAffected: number, threshold = DEFAULT_HIGH_IMPACT_THRESHOLD): boolean {
    return totalAffected >= threshold;
  }
}
