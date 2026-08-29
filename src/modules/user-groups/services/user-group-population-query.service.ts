import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
import { CriteriaImpactResponseDto, MatchedMemberDto, PreviewMatchingResponseDto } from '../dto';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupPopulationQueryService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly membershipRepo: UserGroupMembershipRepository,
    private readonly matchingEngine: UserGroupMatchingEngine,
  ) {}

  /**
   * Retrieves paginated list of materialized members of a user group.
   */
  async getMatchingPopulation(
    tenantCode: string,
    groupId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: MatchedMemberDto[]; total: number; page: number; limit: number }> {
    const group = await this.userGroupRepo.findByTenantAndId(tenantCode, groupId);
    if (!group) {
      throw new NotFoundException(`User group with ID ${groupId} not found`);
    }

    const skip = (page - 1) * limit;
    const [members, total] = await this.membershipRepo.findMembershipsByGroup(
      tenantCode,
      groupId,
      skip,
      limit,
    );

    const items = members.map((m) => MatchedMemberDto.mapFromUserGroup(m));
    return { items, total, page, limit };
  }

  /**
   * Previews population matching against draft criteria without saving or mutating state.
   */
  async previewCriteriaPopulation(
    tenantCode: string,
    matchingRule: MatchingRule,
  ): Promise<PreviewMatchingResponseDto> {
    MatchingRuleValidator.validate(matchingRule);

    const query = this.matchingEngine.buildMatchingQuery(tenantCode, matchingRule);
    const manager = this.transactionService.getManager();

    // Query matched employee ids
    const rows = (await manager.query(query.sql, query.params)) as Array<{ employee_id: string }>;
    const matchedEmployeeIds: string[] = rows.map((r) => r.employee_id);

    if (matchedEmployeeIds.length === 0) {
      return {
        matchedCount: 0,
        sampleEmployees: [],
      };
    }

    // Fetch sample details for first 10 employees
    const sampleIds = matchedEmployeeIds.slice(0, 10);
    const sampleRows = (await manager.query(
      `
      SELECT employee_id, employee_code, department_id, location_id, employment_status, reportees_count
      FROM employee_references
      WHERE tenant_code = $1 AND employee_id = ANY($2::uuid[])
      `,
      [tenantCode, sampleIds],
    )) as Array<{
      employee_id: string;
      employee_code: string;
      department_id: string | null;
      location_id: string | null;
      employment_status: string;
      reportees_count: number;
    }>;

    const sampleEmployees: MatchedMemberDto[] = sampleRows.map((r) => ({
      employeeId: r.employee_id,
      employeeCode: r.employee_code,
      departmentId: r.department_id,
      locationId: r.location_id,
      employmentStatus: r.employment_status,
      reporteesCount: r.reportees_count,
    }));

    return {
      matchedCount: matchedEmployeeIds.length,
      sampleEmployees,
    };
  }

  /**
   * Estimates membership diff (gaining vs losing counts) of a proposed matching rule against current group memberships.
   */
  async estimateCriteriaDiff(
    tenantCode: string,
    groupId: string,
    proposedRule: MatchingRule,
  ): Promise<CriteriaImpactResponseDto> {
    const group = await this.userGroupRepo.findByTenantAndId(tenantCode, groupId);
    if (!group) {
      throw new NotFoundException(`User group with ID ${groupId} not found`);
    }

    MatchingRuleValidator.validate(proposedRule);

    const currentMemberIds = await this.membershipRepo.findMemberEmployeeIdsByGroup(
      tenantCode,
      groupId,
    );

    const query = this.matchingEngine.buildMatchingQuery(tenantCode, proposedRule);
    const manager = this.transactionService.getManager();
    const rows = (await manager.query(query.sql, query.params)) as Array<{ employee_id: string }>;
    const proposedMemberIds: string[] = rows.map((r) => r.employee_id);

    const currentSet = new Set(currentMemberIds);
    const proposedSet = new Set(proposedMemberIds);

    let gainingCount = 0;
    let losingCount = 0;

    for (const empId of proposedSet) {
      if (!currentSet.has(empId)) {
        gainingCount++;
      }
    }

    for (const empId of currentSet) {
      if (!proposedSet.has(empId)) {
        losingCount++;
      }
    }

    return {
      currentCount: currentMemberIds.length,
      proposedCount: proposedMemberIds.length,
      gainingCount,
      losingCount,
    };
  }
}
