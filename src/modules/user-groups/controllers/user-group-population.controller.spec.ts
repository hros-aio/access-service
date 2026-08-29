import { RequestContextService } from '@new-hros/libs-core';

import { DynamicMatchingRuleDto } from '../dto';
import { UserGroupPopulationController } from './user-group-population.controller';
import { UserGroupPopulationQueryService } from '../services/user-group-population-query.service';

describe('UserGroupPopulationController', () => {
  let controller: UserGroupPopulationController;
  let mockService: jest.Mocked<UserGroupPopulationQueryService>;

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
    mockService = {
      getMatchingPopulation: jest.fn(),
      previewCriteriaPopulation: jest.fn(),
      estimateCriteriaDiff: jest.fn(),
    } as unknown as jest.Mocked<UserGroupPopulationQueryService>;
    controller = new UserGroupPopulationController(mockService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMembers', () => {
    it('delegates to populationService.getMatchingPopulation with correct tenant and pagination', async () => {
      mockService.getMatchingPopulation.mockResolvedValueOnce({
        items: [
          {
            employeeId: 'emp-1',
            employeeCode: 'EMP001',
            employmentStatus: 'ACTIVE',
            reporteesCount: 0,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const res = await controller.getMembers('3fa85f64-5717-4562-b3fc-2c963f66afa6', 1, 20);
      expect(mockService.getMatchingPopulation).toHaveBeenCalledWith(
        'TENANT_A',
        '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        1,
        20,
      );
      expect(res.total).toBe(1);
      expect(res.items.length).toBe(1);
    });

    it('defaults page to 1 and limit to 20 when not provided', async () => {
      mockService.getMatchingPopulation.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.getMembers('3fa85f64-5717-4562-b3fc-2c963f66afa6');
      expect(mockService.getMatchingPopulation).toHaveBeenCalledWith(
        'TENANT_A',
        '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        1,
        20,
      );
    });
  });

  describe('previewMatching', () => {
    it('delegates to populationService.previewCriteriaPopulation with tenantCode', async () => {
      mockService.previewCriteriaPopulation.mockResolvedValueOnce({
        matchedCount: 5,
        sampleEmployees: [],
      });

      const ruleDto: DynamicMatchingRuleDto = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-1' }],
      };

      const res = await controller.previewMatching(ruleDto);
      expect(mockService.previewCriteriaPopulation).toHaveBeenCalledWith('TENANT_A', ruleDto);
      expect(res.matchedCount).toBe(5);
    });
  });

  describe('estimateImpact', () => {
    it('delegates to populationService.estimateCriteriaDiff', async () => {
      mockService.estimateCriteriaDiff.mockResolvedValueOnce({
        currentCount: 10,
        proposedCount: 12,
        gainingCount: 4,
        losingCount: 2,
      });

      const ruleDto: DynamicMatchingRuleDto = {
        combinator: 'all',
        clauses: [{ attribute: 'departmentId', operator: 'eq', value: 'dept-2' }],
      };

      const res = await controller.estimateImpact('3fa85f64-5717-4562-b3fc-2c963f66afa6', ruleDto);
      expect(mockService.estimateCriteriaDiff).toHaveBeenCalledWith(
        'TENANT_A',
        '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        ruleDto,
      );
      expect(res.gainingCount).toBe(4);
    });
  });
});
