import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { PaginatedResult } from '@new-hros/libs-sql';

import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
import { CriteriaImpactResponseDto, MatchedMemberDto, PreviewMatchingResponseDto } from '../dto';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

import { EmployeeReferenceRepository } from '@/modules/employee/repositories/employee-reference.repository';

@Injectable()
export class UserGroupPopulationQueryService {
  constructor(
    private readonly userGroupRepo: UserGroupRepository,
    private readonly membershipRepo: UserGroupMembershipRepository,
    private readonly matchingEngine: UserGroupMatchingEngine,
    private readonly employeeReferenceRepo: EmployeeReferenceRepository,
  ) {}

  /**
   * Retrieves paginated list of materialized members of a user group.
   */
  async getMatchingPopulation(
    groupId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<MatchedMemberDto>> {
    const group = await this.userGroupRepo.findById(groupId, { required: true });

    const { data, ...pagination } = await this.membershipRepo.findMembershipsByGroup(group.id, {
      page,
      limit,
    });

    return { data: data.map((m) => MatchedMemberDto.mapFromUserGroup(m)), ...pagination };
  }

  /**
   * Previews population matching against draft criteria without saving or mutating state.
   */
  async previewCriteriaPopulation(matchingRule: MatchingRule): Promise<PreviewMatchingResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    MatchingRuleValidator.validate(matchingRule);

    const query = this.matchingEngine.buildMatchingQuery(tenantCode, matchingRule);
    // Query matched employee ids
    const matchedEmployeeIds = await this.employeeReferenceRepo.getMatchedEmployeeIds(
      query.sql,
      query.params,
    );
    if (matchedEmployeeIds.length === 0) {
      return {
        matchedCount: 0,
        sampleEmployees: [],
      };
    }

    // Fetch sample details for first 10 employees
    const sampleIds = matchedEmployeeIds.slice(0, 10);
    const sampleEmployees = await this.employeeReferenceRepo.findByIds(tenantCode, sampleIds);

    return {
      matchedCount: matchedEmployeeIds.length,
      sampleEmployees,
    };
  }

  /**
   * Estimates membership diff (gaining vs losing counts) of a proposed matching rule against current group memberships.
   */
  async estimateCriteriaDiff(
    groupId: string,
    proposedRule: MatchingRule,
  ): Promise<CriteriaImpactResponseDto> {
    const group = await this.userGroupRepo.findById(groupId, { required: true });

    const tenantCode = RequestContextService.getTenantCode();
    MatchingRuleValidator.validate(proposedRule);

    const currentMemberIds = await this.membershipRepo.findMemberEmployeeIdsByGroup(group.id);

    const query = this.matchingEngine.buildMatchingQuery(tenantCode, proposedRule);
    const proposedMemberIds = await this.employeeReferenceRepo.getMatchedEmployeeIds(
      query.sql,
      query.params,
    );

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
