import { Injectable } from '@nestjs/common';

import { MembershipReconciler } from './membership-reconciler.service';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class EmployeeAttributePropagationService {
  constructor(
    private readonly employeeRepo: EmployeeReferenceRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly matchingEngine: UserGroupMatchingEngine,
    private readonly reconciler: MembershipReconciler,
  ) {}

  /**
   * Handles re-evaluation of user groups for an employee whose attributes changed.
   */
  async handleEmployeeAttributeChange(
    tenantCode: string,
    employeeId: string,
    changedAttributeKeys: string[],
  ): Promise<void> {
    const employee = await this.employeeRepo.findByEmployeeId(tenantCode, employeeId);
    if (!employee) return;

    // Fetch active user groups in tenant with overlapping attribute keys
    const candidateGroups = await this.userGroupRepo.findByAttributeKeys(
      tenantCode,
      changedAttributeKeys,
    );

    // If no candidate group rules monitor these attributes, skip evaluation
    if (candidateGroups.length === 0) return;

    // Fetch all active user groups to accurately evaluate target matching membership set
    const allActiveGroups = await this.userGroupRepo.findActiveGroups(tenantCode);

    const matchingGroupIds: string[] = [];
    for (const group of allActiveGroups) {
      const isMatch = this.matchingEngine.evaluate(group.matchingRule, employee);
      if (isMatch) {
        matchingGroupIds.push(group.id);
      }
    }

    // Reconcile memberships and cascaded effective roles
    await this.reconciler.reconcileSingleEmployee(tenantCode, employeeId, matchingGroupIds);
  }
}
