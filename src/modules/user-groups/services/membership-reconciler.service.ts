import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { UserGroupStatus } from '../domain/enums';
import {
  UserEffectiveRoleEntry,
  UserEffectiveRoleRepository,
} from '../repositories/user-effective-role.repository';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

export interface SingleEmployeeReconciliationResult {
  employeeId: string;
  addedGroupIds: string[];
  removedGroupIds: string[];
  effectiveRolesChanged: boolean;
}

export interface GroupPopulationReconciliationResult {
  groupId: string;
  addedEmployeeIds: string[];
  removedEmployeeIds: string[];
  totalAffected: number;
}

@Injectable()
export class MembershipReconciler {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly userGroupRoleRepo: UserGroupRoleRepository,
    private readonly membershipRepo: UserGroupMembershipRepository,
    private readonly effectiveRoleRepo: UserEffectiveRoleRepository,
    private readonly outboxRepo: AuthSecurityEventOutboxRepository,
  ) {}

  /**
   * Reconciles group memberships and cascaded effective roles for a single employee.
   */
  async reconcileSingleEmployee(
    tenantCode: string,
    employeeId: string,
    targetMatchingGroupIds: string[],
  ): Promise<SingleEmployeeReconciliationResult> {
    const currentMemberships = await this.membershipRepo.findMembershipsByEmployee(employeeId);
    const currentGroupIds = new Set(currentMemberships.map((m) => m.groupId));
    const targetGroupIdSet = new Set(targetMatchingGroupIds);

    const addedGroupIds: string[] = [];
    const removedGroupIds: string[] = [];

    for (const gid of targetGroupIdSet) {
      if (!currentGroupIds.has(gid)) {
        addedGroupIds.push(gid);
      }
    }

    for (const gid of currentGroupIds) {
      if (!targetGroupIdSet.has(gid)) {
        removedGroupIds.push(gid);
      }
    }

    if (addedGroupIds.length === 0 && removedGroupIds.length === 0) {
      return {
        employeeId,
        addedGroupIds: [],
        removedGroupIds: [],
        effectiveRolesChanged: false,
      };
    }

    // Apply membership diffs
    for (const gid of addedGroupIds) {
      await this.membershipRepo.insertSingleMembership(employeeId, gid);
    }

    for (const gid of removedGroupIds) {
      await this.membershipRepo.deleteSingleMembership(employeeId, gid);
    }

    // Recalculate effective roles across all currently matching groups
    const targetRoles: UserEffectiveRoleEntry[] = [];
    for (const gid of targetMatchingGroupIds) {
      const group = await this.userGroupRepo.findById(gid);
      if (!group || group.status !== UserGroupStatus.ACTIVE) continue;

      const roles = await this.userGroupRoleRepo.findByGroup(gid);
      for (const r of roles) {
        targetRoles.push({
          roleId: r.roleId,
          sourceGroupId: gid,
          scopeType: group.scopeType,
          scopeEntityId: group.scopeRefId || null,
        });
      }
    }

    const roleDiff = await this.effectiveRoleRepo.syncEffectiveRolesForEmployee(
      employeeId,
      targetRoles,
    );

    // Record outbox audit event
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = tenantCode;
    outbox.eventType = 'AUTHORIZATION_MEMBERSHIP_RECONCILED';
    outbox.sanitizedPayload = {
      employeeId,
      addedGroupIds,
      removedGroupIds,
      effectiveRolesInserted: roleDiff.inserted,
      effectiveRolesDeleted: roleDiff.deleted,
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    await this.outboxRepo.create(outbox);

    return {
      employeeId,
      addedGroupIds,
      removedGroupIds,
      effectiveRolesChanged: roleDiff.inserted > 0 || roleDiff.deleted > 0,
    };
  }

  /**
   * Reconciles entire tenant population for a specific user group (e.g. on group criteria update or sync).
   */
  async reconcileGroupPopulation(
    groupId: string,
    matchedEmployeeIds: string[],
    groupVersion: number,
  ): Promise<GroupPopulationReconciliationResult> {
    const currentMemberIds = await this.membershipRepo.findMemberEmployeeIdsByGroup(groupId);

    const currentSet = new Set(currentMemberIds);
    const matchedSet = new Set(matchedEmployeeIds);

    const addedEmployeeIds: string[] = [];
    const removedEmployeeIds: string[] = [];

    for (const empId of matchedSet) {
      if (!currentSet.has(empId)) {
        addedEmployeeIds.push(empId);
      }
    }

    for (const empId of currentSet) {
      if (!matchedSet.has(empId)) {
        removedEmployeeIds.push(empId);
      }
    }

    if (addedEmployeeIds.length > 0) {
      await this.membershipRepo.batchInsert(groupId, addedEmployeeIds);
    }

    if (removedEmployeeIds.length > 0) {
      await this.membershipRepo.batchDelete(groupId, removedEmployeeIds);
    }

    const group = await this.userGroupRepo.findFullyById(groupId);
    if (group) {
      // Reconcile effective roles for affected employees
      const affectedEmployeeIds = [...addedEmployeeIds, ...removedEmployeeIds];
      for (const empId of affectedEmployeeIds) {
        const empMemberships = await this.membershipRepo.findMembershipsByEmployee(empId);

        const targetRoles: UserEffectiveRoleEntry[] = [];
        for (const m of empMemberships) {
          const g = await this.userGroupRepo.findFullyById(m.groupId);
          if (!g || g.status !== UserGroupStatus.ACTIVE) continue;

          const gRoles = await this.userGroupRoleRepo.findByGroup(m.groupId);
          for (const gr of gRoles) {
            targetRoles.push({
              roleId: gr.roleId,
              sourceGroupId: g.id,
              scopeType: g.scopeType,
              scopeEntityId: g.scopeRefId || null,
            });
          }
        }

        await this.effectiveRoleRepo.syncEffectiveRolesForEmployee(empId, targetRoles);
      }

      await this.userGroupRepo.updateProjectionVersion(groupId, groupVersion);
    }

    return {
      groupId,
      addedEmployeeIds,
      removedEmployeeIds,
      totalAffected: addedEmployeeIds.length + removedEmployeeIds.length,
    };
  }
}
