import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { ScopeType } from '../domain/enums/scope-type.enum';
import { UserGroupNotFoundError } from '../domain/exceptions/user-group.exceptions';
import { UserGroupScopeValidator } from '../domain/validators/user-group-scope.validator';
import { ScopeImpactEstimateDto } from '../dto/scope-impact-estimate.dto';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupScopeImpactService {
  private readonly logger = new Logger(UserGroupScopeImpactService.name);
  public static readonly HIGH_IMPACT_THRESHOLD = 100;

  constructor(
    private readonly userGroupRepository: UserGroupRepository,
    private readonly membershipRepository: UserGroupMembershipRepository,
  ) {}

  async estimateScopeImpact(
    userGroupId: string,
    proposedScopeType: ScopeType | string,
    proposedScopeRefId?: string | null,
  ): Promise<ScopeImpactEstimateDto> {
    const tenantCode = RequestContextService.getTenantCode();

    const group = await this.userGroupRepository.findByTenantAndId(tenantCode, userGroupId);
    if (!group) {
      throw new UserGroupNotFoundError(userGroupId);
    }

    // Validate proposed scope parameters
    const validated = UserGroupScopeValidator.validate(proposedScopeType, proposedScopeRefId);

    const affectedUserCount = await this.membershipRepository.countByGroup(tenantCode, userGroupId);
    const threshold = UserGroupScopeImpactService.HIGH_IMPACT_THRESHOLD;
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
