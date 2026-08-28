import { EmployeeAttributePropagationService } from './employee-attribute-propagation.service';
import { MembershipReconciler } from './membership-reconciler.service';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('EmployeeAttributePropagationService', () => {
  let service: EmployeeAttributePropagationService;
  let mockEmployeeRepo: jest.Mocked<EmployeeReferenceRepository>;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockMatchingEngine: jest.Mocked<UserGroupMatchingEngine>;
  let mockReconciler: jest.Mocked<MembershipReconciler>;

  beforeEach(() => {
    mockEmployeeRepo = {
      findByEmployeeId: jest.fn(),
    } as unknown as jest.Mocked<EmployeeReferenceRepository>;
    mockUserGroupRepo = {
      findByAttributeKeys: jest.fn(),
      findActiveGroups: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;
    mockMatchingEngine = {
      evaluate: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMatchingEngine>;
    mockReconciler = {
      reconcileSingleEmployee: jest.fn(),
    } as unknown as jest.Mocked<MembershipReconciler>;

    service = new EmployeeAttributePropagationService(
      mockEmployeeRepo,
      mockUserGroupRepo,
      mockMatchingEngine,
      mockReconciler,
    );
  });

  it('evaluates active groups and triggers single employee reconciliation', async () => {
    mockEmployeeRepo.findByEmployeeId.mockResolvedValueOnce({
      employeeId: 'emp-1',
      tenantCode: 'DEFAULT',
      departmentId: 'dept-1',
    } as EmployeeReference);
    mockUserGroupRepo.findByAttributeKeys.mockResolvedValueOnce([{ id: 'grp-1' } as UserGroup]);
    mockUserGroupRepo.findActiveGroups.mockResolvedValueOnce([
      { id: 'grp-1', matchingRule: { clauses: [] } } as unknown as UserGroup,
    ]);
    mockMatchingEngine.evaluate.mockReturnValueOnce(true);

    await service.handleEmployeeAttributeChange('DEFAULT', 'emp-1', ['departmentId']);

    expect(mockReconciler.reconcileSingleEmployee).toHaveBeenCalledWith('DEFAULT', 'emp-1', [
      'grp-1',
    ]);
  });
});
