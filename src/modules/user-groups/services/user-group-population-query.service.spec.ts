import { NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { UserGroupPopulationQueryService } from './user-group-population-query.service';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
import { UserGroupMembership } from '../entities/user-group-membership.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

import { EmployeeReferenceRepository } from '@/modules/employee/repositories/employee-reference.repository';

describe('UserGroupPopulationQueryService', () => {
  let service: UserGroupPopulationQueryService;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockMembershipRepo: jest.Mocked<UserGroupMembershipRepository>;
  let mockMatchingEngine: jest.Mocked<UserGroupMatchingEngine>;
  let mockEmployeeRefRepo: jest.Mocked<EmployeeReferenceRepository>;

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');

    mockUserGroupRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;
    mockMembershipRepo = {
      findMembershipsByGroup: jest.fn(),
      findMemberEmployeeIdsByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;
    mockMatchingEngine = {
      buildMatchingQuery: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMatchingEngine>;
    mockEmployeeRefRepo = {
      getMatchedEmployeeIds: jest.fn(),
      findByIds: jest.fn(),
    } as unknown as jest.Mocked<EmployeeReferenceRepository>;

    service = new UserGroupPopulationQueryService(
      mockUserGroupRepo,
      mockMembershipRepo,
      mockMatchingEngine,
      mockEmployeeRefRepo,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMatchingPopulation', () => {
    it('throws NotFoundException when user group does not exist in tenant', async () => {
      mockUserGroupRepo.findById.mockImplementationOnce((id, options) => {
        if (options?.required) {
          return Promise.reject(new NotFoundException(`Record not found with ID: ${id}`));
        }
        return Promise.resolve(null);
      });

      await expect(service.getMatchingPopulation('non-existent-group-id', 1, 20)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns paginated materialized members when group exists', async () => {
      mockUserGroupRepo.findById.mockResolvedValueOnce({ id: 'grp-1' } as UserGroup);
      const fakeMembership = {
        employeeId: 'emp-1',
        matchedAt: new Date('2026-08-29T10:00:00Z'),
        employee: {
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          departmentId: 'dept-1',
          locationId: 'loc-1',
          employmentStatus: 'ACTIVE',
          reporteesCount: 3,
        },
      } as unknown as UserGroupMembership;

      mockMembershipRepo.findMembershipsByGroup.mockResolvedValueOnce({
        data: [fakeMembership],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await service.getMatchingPopulation('grp-1', 1, 20);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data.length).toBe(1);
      expect(result.data[0].employeeCode).toBe('EMP001');
      expect(result.data[0].reporteesCount).toBe(3);
    });

    it('returns clean empty array when group has 0 materialized members', async () => {
      mockUserGroupRepo.findById.mockResolvedValueOnce({ id: 'grp-empty' } as UserGroup);
      mockMembershipRepo.findMembershipsByGroup.mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const result = await service.getMatchingPopulation('grp-empty', 1, 20);
      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('previewCriteriaPopulation', () => {
    it('executes matching query and returns count and samples', async () => {
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockEmployeeRefRepo.getMatchedEmployeeIds.mockResolvedValueOnce(['emp-1']);
      mockEmployeeRefRepo.findByIds.mockResolvedValueOnce([
        {
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          departmentId: 'dept-1',
          locationId: null,
          employmentStatus: 'ACTIVE',
          reporteesCount: 0,
        } as never,
      ]);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-1' }],
      };

      const res = await service.previewCriteriaPopulation(rule);
      expect(res.matchedCount).toBe(1);
      expect(res.sampleEmployees[0].employeeId).toBe('emp-1');
    });

    it('returns 0 count and empty array when no employees match draft criteria', async () => {
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockEmployeeRefRepo.getMatchedEmployeeIds.mockResolvedValueOnce([]);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'non-existent-dept' }],
      };

      const res = await service.previewCriteriaPopulation(rule);
      expect(res.matchedCount).toBe(0);
      expect(res.sampleEmployees).toEqual([]);
    });
  });

  describe('estimateCriteriaDiff', () => {
    it('calculates gaining and losing diffs correctly', async () => {
      mockUserGroupRepo.findById.mockResolvedValueOnce({ id: 'grp-1' } as UserGroup);
      mockMembershipRepo.findMemberEmployeeIdsByGroup.mockResolvedValueOnce(['emp-1', 'emp-2']);
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockEmployeeRefRepo.getMatchedEmployeeIds.mockResolvedValueOnce(['emp-2', 'emp-3']);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-2' }],
      };

      const res = await service.estimateCriteriaDiff('grp-1', rule);
      expect(res.currentCount).toBe(2);
      expect(res.proposedCount).toBe(2);
      expect(res.gainingCount).toBe(1); // emp-3
      expect(res.losingCount).toBe(1); // emp-1
    });
  });
});
