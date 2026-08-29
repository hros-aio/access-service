import { NotFoundException } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { UserGroupPopulationQueryService } from './user-group-population-query.service';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
import { UserGroupMembership } from '../entities/user-group-membership.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupPopulationQueryService', () => {
  let service: UserGroupPopulationQueryService;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockMembershipRepo: jest.Mocked<UserGroupMembershipRepository>;
  let mockMatchingEngine: jest.Mocked<UserGroupMatchingEngine>;
  let mockManager: { query: jest.Mock };

  beforeEach(() => {
    mockManager = {
      query: jest.fn(),
    };
    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockManager),
    } as unknown as jest.Mocked<TransactionService>;
    mockUserGroupRepo = {
      findByTenantAndId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;
    mockMembershipRepo = {
      findMembershipsByGroup: jest.fn(),
      findMemberEmployeeIdsByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;
    mockMatchingEngine = {
      buildMatchingQuery: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMatchingEngine>;

    service = new UserGroupPopulationQueryService(
      mockTransactionService,
      mockUserGroupRepo,
      mockMembershipRepo,
      mockMatchingEngine,
    );
  });

  describe('getMatchingPopulation', () => {
    it('throws NotFoundException when user group does not exist in tenant', async () => {
      mockUserGroupRepo.findByTenantAndId.mockResolvedValueOnce(null);

      await expect(
        service.getMatchingPopulation('TENANT_A', 'non-existent-group-id', 1, 20),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns paginated materialized members when group exists', async () => {
      mockUserGroupRepo.findByTenantAndId.mockResolvedValueOnce({ id: 'grp-1' } as UserGroup);
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

      mockMembershipRepo.findMembershipsByGroup.mockResolvedValueOnce([[fakeMembership], 1]);

      const result = await service.getMatchingPopulation('TENANT_A', 'grp-1', 1, 20);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.items.length).toBe(1);
      expect(result.items[0].employeeCode).toBe('EMP001');
      expect(result.items[0].reporteesCount).toBe(3);
    });

    it('returns clean empty array when group has 0 materialized members', async () => {
      mockUserGroupRepo.findByTenantAndId.mockResolvedValueOnce({ id: 'grp-empty' } as UserGroup);
      mockMembershipRepo.findMembershipsByGroup.mockResolvedValueOnce([[], 0]);

      const result = await service.getMatchingPopulation('TENANT_A', 'grp-empty', 1, 20);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('previewCriteriaPopulation', () => {
    it('executes matching query and returns count and samples', async () => {
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockManager.query.mockResolvedValueOnce([{ employee_id: 'emp-1' }]).mockResolvedValueOnce([
        {
          employee_id: 'emp-1',
          employee_code: 'EMP001',
          department_id: 'dept-1',
          location_id: null,
          employment_status: 'ACTIVE',
          reportees_count: 0,
        },
      ]);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-1' }],
      };

      const res = await service.previewCriteriaPopulation('DEFAULT', rule);
      expect(res.matchedCount).toBe(1);
      expect(res.sampleEmployees[0].employeeId).toBe('emp-1');
    });

    it('returns 0 count and empty array when no employees match draft criteria', async () => {
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockManager.query.mockResolvedValueOnce([]);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'non-existent-dept' }],
      };

      const res = await service.previewCriteriaPopulation('DEFAULT', rule);
      expect(res.matchedCount).toBe(0);
      expect(res.sampleEmployees).toEqual([]);
    });
  });

  describe('estimateCriteriaDiff', () => {
    it('calculates gaining and losing diffs correctly', async () => {
      mockUserGroupRepo.findByTenantAndId.mockResolvedValueOnce({ id: 'grp-1' } as UserGroup);
      mockMembershipRepo.findMemberEmployeeIdsByGroup.mockResolvedValueOnce(['emp-1', 'emp-2']);
      mockMatchingEngine.buildMatchingQuery.mockReturnValueOnce({
        sql: 'SELECT employee_id FROM employee_references WHERE ...',
        params: ['DEFAULT'],
      });
      mockManager.query.mockResolvedValueOnce([{ employee_id: 'emp-2' }, { employee_id: 'emp-3' }]);

      const rule: MatchingRule = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-2' }],
      };

      const res = await service.estimateCriteriaDiff('DEFAULT', 'grp-1', rule);
      expect(res.currentCount).toBe(2);
      expect(res.proposedCount).toBe(2);
      expect(res.gainingCount).toBe(1); // emp-3
      expect(res.losingCount).toBe(1); // emp-1
    });
  });
});
