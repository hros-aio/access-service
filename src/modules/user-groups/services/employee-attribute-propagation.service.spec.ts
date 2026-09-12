import { EmployeeAttributePropagationService } from './employee-attribute-propagation.service';
import { MembershipReconciler } from './membership-reconciler.service';
import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('EmployeeAttributePropagationService', () => {
  let service: EmployeeAttributePropagationService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEmployeeRepo: jest.Mocked<EmployeeReferenceRepository>;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockMatchingEngine: jest.Mocked<UserGroupMatchingEngine>;
  let mockReconciler: jest.Mocked<MembershipReconciler>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmployeeId: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    mockEmployeeRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateReporteesCount: jest.fn(),
    } as unknown as jest.Mocked<EmployeeReferenceRepository>;
    mockUserGroupRepo = {
      findByAttributeKeys: jest.fn(),
      findActiveGroups: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;
    mockMatchingEngine = {
      evaluate: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMatchingEngine>;
    mockReconciler = {
      reconcileSingleUser: jest.fn(),
    } as unknown as jest.Mocked<MembershipReconciler>;

    service = new EmployeeAttributePropagationService(
      mockUserRepo,
      mockEmployeeRepo,
      mockUserGroupRepo,
      mockMatchingEngine,
      mockReconciler,
    );
  });

  it('creates employee reference on upsert if it does not exist', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(null);

    await service.handleEmployeeUpsert({
      id: 'emp-1',
      tenantCode: 'DEFAULT',
      employeeCode: 'EMP001',
      departmentId: 'dept-1',
      sourceVersion: 1,
    });

    expect(mockEmployeeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'emp-1',
        tenantCode: 'DEFAULT',
        employeeCode: 'EMP001',
        departmentId: 'dept-1',
      }),
    );
    expect(mockEmployeeRepo.update).not.toHaveBeenCalled();
  });

  it('updates employee reference on upsert and propagates changes to user groups', async () => {
    const existingEmployee = {
      id: 'emp-1',
      tenantCode: 'DEFAULT',
      employeeCode: 'EMP001',
      departmentId: 'dept-old',
    } as EmployeeReference;

    mockEmployeeRepo.findById
      .mockResolvedValueOnce(existingEmployee) // for upsert check
      .mockResolvedValueOnce(existingEmployee); // for handleEmployeeAttributeChange check

    mockUserGroupRepo.findByAttributeKeys.mockResolvedValueOnce([{ id: 'grp-1' } as UserGroup]);
    mockUserGroupRepo.findActiveGroups.mockResolvedValueOnce([
      { id: 'grp-1', matchingRule: { clauses: [] } } as unknown as UserGroup,
    ]);
    mockMatchingEngine.evaluate.mockReturnValueOnce(true);
    mockUserRepo.findByEmployeeId.mockResolvedValueOnce({ id: 'user-1' } as User);

    await service.handleEmployeeUpsert({
      id: 'emp-1',
      tenantCode: 'DEFAULT',
      employeeCode: 'EMP001',
      departmentId: 'dept-new',
      sourceVersion: 2,
    });

    expect(mockEmployeeRepo.update).toHaveBeenCalledWith(
      'emp-1',
      expect.objectContaining({
        departmentId: 'dept-new',
      }),
    );
    expect(mockReconciler.reconcileSingleUser).toHaveBeenCalledWith('DEFAULT', 'user-1', ['grp-1']);
  });

  it('handles reporting line changed by updating reportee count and propagating', async () => {
    const oldManager = { id: 'mgr-old', tenantCode: 'DEFAULT' } as EmployeeReference;
    const newManager = { id: 'mgr-new', tenantCode: 'DEFAULT' } as EmployeeReference;

    mockEmployeeRepo.findById.mockResolvedValueOnce(oldManager).mockResolvedValueOnce(newManager);

    mockUserGroupRepo.findByAttributeKeys
      .mockResolvedValueOnce([{ id: 'grp-1' } as UserGroup])
      .mockResolvedValueOnce([{ id: 'grp-1' } as UserGroup]);
    mockUserGroupRepo.findActiveGroups
      .mockResolvedValueOnce([
        { id: 'grp-1', matchingRule: { clauses: [] } } as unknown as UserGroup,
      ])
      .mockResolvedValueOnce([
        { id: 'grp-1', matchingRule: { clauses: [] } } as unknown as UserGroup,
      ]);

    mockMatchingEngine.evaluate.mockReturnValueOnce(true).mockReturnValueOnce(true);

    mockUserRepo.findByEmployeeId
      .mockResolvedValueOnce({ id: 'user-mgr-old' } as User)
      .mockResolvedValueOnce({ id: 'user-mgr-new' } as User);

    await service.handleEmployeeReportingLineChanged('DEFAULT', 'mgr-old', 'mgr-new');

    expect(mockEmployeeRepo.updateReporteesCount).toHaveBeenCalledWith('DEFAULT', 'mgr-old', -1);
    expect(mockEmployeeRepo.updateReporteesCount).toHaveBeenCalledWith('DEFAULT', 'mgr-new', 1);
    expect(mockReconciler.reconcileSingleUser).toHaveBeenCalledWith('DEFAULT', 'user-mgr-old', [
      'grp-1',
    ]);
    expect(mockReconciler.reconcileSingleUser).toHaveBeenCalledWith('DEFAULT', 'user-mgr-new', [
      'grp-1',
    ]);
  });
});
