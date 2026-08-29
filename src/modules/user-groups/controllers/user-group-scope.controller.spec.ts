import { UserGroupScopeController } from './user-group-scope.controller';
import { ScopeType } from '../domain/enums/scope-type.enum';
import { ScopeImpactEstimateDto } from '../dto/scope-impact-estimate.dto';
import { UserGroupScopeDetailsDto } from '../dto/user-group-scope-details.dto';
import { UserGroupImpactService } from '../services/user-group-impact.service';
import { UserGroupScopeService } from '../services/user-group-scope.service';

describe('UserGroupScopeController', () => {
  let controller: UserGroupScopeController;
  let scopeService: jest.Mocked<UserGroupScopeService>;
  let impactService: jest.Mocked<UserGroupImpactService>;

  const userGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    scopeService = {
      getScope: jest.fn(),
      updateScope: jest.fn(),
    } as unknown as jest.Mocked<UserGroupScopeService>;

    impactService = {
      estimateScopeImpact: jest.fn(),
    } as unknown as jest.Mocked<UserGroupImpactService>;

    controller = new UserGroupScopeController(scopeService, impactService);
  });

  it('should get scope configuration', async () => {
    const mockScope: UserGroupScopeDetailsDto = {
      userGroupId,
      scopeType: ScopeType.DEPARTMENT,
      scopeRefId: 'dept-01',
      version: 2,
      projectionVersion: 2,
      isPendingSync: false,
    };
    scopeService.getScope.mockResolvedValue(mockScope);

    const result = await controller.getScope(userGroupId);

    expect(result).toBe(mockScope);
    expect(scopeService.getScope).toHaveBeenCalledWith(userGroupId);
  });

  it('should call impactService on estimateImpact', async () => {
    const mockEstimate: ScopeImpactEstimateDto = {
      userGroupId,
      affectedUserCount: 50,
      threshold: 100,
      requiresConfirmation: false,
      currentScope: { scopeType: ScopeType.SELF, scopeRefId: null },
      proposedScope: { scopeType: ScopeType.COMPANY, scopeRefId: 'comp-1' },
    };
    impactService.estimateScopeImpact.mockResolvedValue(mockEstimate);

    const result = await controller.estimateImpact(userGroupId, {
      scopeType: ScopeType.COMPANY,
      scopeRefId: 'comp-1',
    });

    expect(result).toBe(mockEstimate);
    expect(impactService.estimateScopeImpact).toHaveBeenCalledWith(
      userGroupId,
      ScopeType.COMPANY,
      'comp-1',
    );
  });

  it('should call scopeService on updateScope', async () => {
    const mockUpdatedScope: UserGroupScopeDetailsDto = {
      userGroupId,
      scopeType: ScopeType.COMPANY,
      scopeRefId: 'comp-1',
      version: 3,
      projectionVersion: 2,
      isPendingSync: true,
    };
    scopeService.updateScope.mockResolvedValue(mockUpdatedScope);

    const result = await controller.updateScope(userGroupId, {
      scopeType: ScopeType.COMPANY,
      scopeRefId: 'comp-1',
      expectedVersion: 2,
      confirmed: true,
    });

    expect(result).toBe(mockUpdatedScope);
    expect(scopeService.updateScope).toHaveBeenCalledWith(userGroupId, {
      scopeType: ScopeType.COMPANY,
      scopeRefId: 'comp-1',
      expectedVersion: 2,
      confirmed: true,
    });
  });
});
