import { Injectable, Logger } from '@nestjs/common';

import { MembershipReconciler } from './membership-reconciler.service';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import {
  EmployeeReferenceRepository,
  UpsertEmployeeProjectionInput,
} from '../../employee/repositories/employee-reference.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

import { EmployeeStatus } from '@/enums/employee-status.enum';
import { UserRepository } from '@/modules/user/repositories/user.repository';

@Injectable()
export class EmployeeAttributePropagationService {
  private readonly logger = new Logger(EmployeeAttributePropagationService.name);
  constructor(
    private readonly userRepo: UserRepository,
    private readonly employeeRepo: EmployeeReferenceRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly matchingEngine: UserGroupMatchingEngine,
    private readonly reconciler: MembershipReconciler,
  ) {}

  async handleEmployeeUpsert(data: UpsertEmployeeProjectionInput): Promise<void> {
    const employee = await this.employeeRepo.findById(data.id);
    if (!employee) {
      await this.employeeRepo.create({
        id: data.id,
        tenantCode: data.tenantCode,
        employeeCode: data.employeeCode,
        companyId: data.companyId ?? undefined,
        locationId: data.locationId ?? undefined,
        departmentId: data.departmentId ?? undefined,
        gradeId: data.gradeId ?? undefined,
        jobTitleId: data.jobTitleId ?? undefined,
        employmentStatus: EmployeeStatus.ACTIVE,
        status: EmployeeStatus.ACTIVE,
        managerId: data.managerEmployeeId ?? undefined,
        sourceVersion: data.sourceVersion.toString(),
      });
      return;
    }

    await this.employeeRepo.update(data.id, {
      companyId: data.companyId ?? undefined,
      locationId: data.locationId ?? undefined,
      departmentId: data.departmentId ?? undefined,
      gradeId: data.gradeId ?? undefined,
      jobTitleId: data.jobTitleId ?? undefined,
      employmentStatus: data.employmentStatus ?? undefined,
    });
    const changedKeys: string[] = [];
    if (data.departmentId) changedKeys.push('departmentId');
    if (data.locationId) changedKeys.push('locationId');
    if (data.companyId) changedKeys.push('companyId');
    if (data.gradeId) changedKeys.push('gradeId');
    if (data.jobTitleId) changedKeys.push('jobTitleId');
    if (data.employmentStatus || data.status) changedKeys.push('employmentStatus');

    if (changedKeys.length > 0) {
      await this.handleEmployeeAttributeChange(data.tenantCode, data.id, changedKeys);
    }
  }

  async handleEmployeeReportingLineChanged(
    tenantCode: string,
    oldManagerEmployeeId?: string | null,
    newManagerEmployeeId?: string | null,
  ): Promise<void> {
    if (oldManagerEmployeeId) {
      await this.employeeRepo.updateReporteesCount(tenantCode, oldManagerEmployeeId, -1);
      await this.handleEmployeeAttributeChange(tenantCode, oldManagerEmployeeId, [
        'reporteesCount',
        'hasReportees',
      ]);
    }

    if (newManagerEmployeeId) {
      await this.employeeRepo.updateReporteesCount(tenantCode, newManagerEmployeeId, 1);
      await this.handleEmployeeAttributeChange(tenantCode, newManagerEmployeeId, [
        'reporteesCount',
        'hasReportees',
      ]);
    }
  }

  /**
   * Handles re-evaluation of user groups for an employee whose attributes changed.
   */
  private async handleEmployeeAttributeChange(
    tenantCode: string,
    employeeId: string,
    changedAttributeKeys: string[],
  ): Promise<void> {
    const employee = await this.employeeRepo.findById(employeeId);
    if (!employee) return;

    // Fetch active user groups in tenant with overlapping attribute keys
    const candidateGroups = await this.userGroupRepo.findByAttributeKeys(changedAttributeKeys);

    // If no candidate group rules monitor these attributes, skip evaluation
    if (candidateGroups.length === 0) return;

    // Fetch all active user groups to accurately evaluate target matching membership set
    const allActiveGroups = await this.userGroupRepo.findActiveGroups();

    const matchingGroupIds: string[] = [];
    for (const group of allActiveGroups) {
      const isMatch = this.matchingEngine.evaluate(group.matchingRule, employee);
      if (isMatch) {
        matchingGroupIds.push(group.id);
      }
    }

    // Reconcile memberships and cascaded effective roles
    const user = await this.userRepo.findByEmployeeId(employeeId);
    if (!user) {
      this.logger.error('User not found with employee id', { employeeId, tenantCode });
      return;
    }
    await this.reconciler.reconcileSingleUser(tenantCode, user.id, matchingGroupIds);
  }
}
