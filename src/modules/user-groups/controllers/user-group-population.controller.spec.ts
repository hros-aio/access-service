import { DynamicMatchingRuleDto } from '../dto';
import { UserGroupPopulationController } from './user-group-population.controller';
import { UserGroupPopulationQueryService } from '../services/user-group-population-query.service';

describe('UserGroupPopulationController', () => {
  let controller: UserGroupPopulationController;
  let mockService: jest.Mocked<UserGroupPopulationQueryService>;

  beforeEach(() => {
    mockService = {
      getMatchingPopulation: jest.fn(),
      previewCriteriaPopulation: jest.fn(),
      estimateCriteriaDiff: jest.fn(),
    } as unknown as jest.Mocked<UserGroupPopulationQueryService>;
    controller = new UserGroupPopulationController(mockService);
  });

  it('previewMatching delegates to population service', async () => {
    mockService.previewCriteriaPopulation.mockResolvedValueOnce({
      matchedCount: 5,
      sampleEmployees: [],
    });

    const ruleDto: DynamicMatchingRuleDto = {
      combinator: 'all',
      clauses: [{ field: 'departmentId', operator: 'eq', value: 'dept-1' }],
    };

    const res = await controller.previewMatching(ruleDto);
    expect(res.matchedCount).toBe(5);
  });
});
