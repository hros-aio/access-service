import { Injectable, Logger } from '@nestjs/common';

import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { UserGroupMembershipRepository } from '../../user-groups/repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../../user-groups/repositories/user-group-role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { EffectiveUserRole } from '../interfaces/effective-user-role.interface';
import {
  PersistUserEffectiveRoleEntry,
  UserEffectiveRoleRepository,
} from '../repositories/user-effective-role.repository';

import { UserGroupStatus } from '@/modules/user-groups';

export interface RecomputeResult {
  inserted: number;
  deleted: number;
  activeRolesCount: number;
}

@Injectable()
export class EffectiveRoleProjectionService {
  private readonly logger = new Logger(EffectiveRoleProjectionService.name);

  constructor(
    private readonly userGroupRepo: UserGroupRepository,
    private readonly userGroupRoleRepo: UserGroupRoleRepository,
    private readonly membershipRepo: UserGroupMembershipRepository,
    private readonly effectiveRoleRepo: UserEffectiveRoleRepository,
    private readonly cacheService: UserAuthorizationCacheService,
  ) {}

  async recomputeUserEffectiveRoles(
    tenantCode: string,
    employeeId: string,
  ): Promise<RecomputeResult> {
    const activeMemberships = await this.membershipRepo.findMembershipsByEmployee(employeeId);

    const targetEntries: PersistUserEffectiveRoleEntry[] = [];
    const memoryRoles: EffectiveUserRole[] = [];

    for (const membership of activeMemberships) {
      const group = await this.userGroupRepo.findById(membership.groupId);
      if (!group || group.status !== UserGroupStatus.ACTIVE) {
        continue;
      }

      const userGroupRoles = await this.userGroupRoleRepo.findByGroup(membership.groupId);
      for (const ugRole of userGroupRoles) {
        const scopeType = group.scopeType as EffectiveUserRole['scope']['type'];
        const scopeRefId = group.scopeRefId || null;

        targetEntries.push({
          roleId: ugRole.roleId,
          sourceGroupId: group.id,
          scope: {
            type: scopeType,
            refId: scopeRefId,
          },
        });

        memoryRoles.push({
          roleId: ugRole.roleId,
          sourceGroupId: group.id,
          scope: {
            type: scopeType,
            refId: scopeRefId,
          },
        });
      }
    }

    let diff = { inserted: 0, deleted: 0 };

    if (targetEntries.length === 0) {
      // Zero matching active groups: remove all effective roles
      const deletedCount = await this.effectiveRoleRepo.deleteByEmployee(employeeId);
      diff = { inserted: 0, deleted: deletedCount };
    } else {
      diff = await this.effectiveRoleRepo.syncUserEffectiveRoles(employeeId, targetEntries);
    }

    // Sync to Redis user authorization cache
    await this.cacheService.syncUserCache(tenantCode, employeeId, memoryRoles);

    return {
      inserted: diff.inserted,
      deleted: diff.deleted,
      activeRolesCount: memoryRoles.length,
    };
  }
}
