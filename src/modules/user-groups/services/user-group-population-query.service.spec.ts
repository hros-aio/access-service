import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { UserGroupPopulationQueryService } from './user-group-population-query.service';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
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

  it('previewCriteriaPopulation executes matching query and returns count and samples', async () => {
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

  it('estimateCriteriaDiff calculates gaining and losing diffs correctly', async () => {
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
