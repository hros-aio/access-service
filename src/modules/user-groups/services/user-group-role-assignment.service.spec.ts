import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupImpactService } from './user-group-impact.service';
import { UserGroupRoleAssignmentService } from './user-group-role-assignment.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import {
  HighImpactConfirmationRequiredError,
  InvalidRoleAssignmentError,
} from '../domain/exceptions/user-group.exceptions';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupRoleAssignmentService', () => {
  let service: UserGroupRoleAssignmentService;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockUserGroupRoleRepo: jest.Mocked<UserGroupRoleRepository>;
  let mockRoleRepo: jest.Mocked<RoleRepository>;
  let mockOutboxRepo: jest.Mocked<AuthSecurityEventOutboxRepository>;
  let mockImpactService: jest.Mocked<UserGroupImpactService>;

  beforeEach(() => {
    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb: () => Promise<unknown>) => cb()),
    } as unknown as jest.Mocked<TransactionService>;

    mockUserGroupRepo = {
      findById: jest.fn(),
      findFullyById: jest.fn(),
      findByTenantAndId: jest.fn(),
      save: jest.fn().mockImplementation((group) => Promise.resolve(group)),
    } as unknown as jest.Mocked<UserGroupRepository>;

    mockUserGroupRoleRepo = {
      findByGroup: jest.fn(),
      findRolesByGroupId: jest.fn().mockResolvedValue([]),
      findRoleIdsByGroupId: jest.fn().mockResolvedValue([]),
      batchDelete: jest.fn(),
      bulkSave: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;

    mockRoleRepo = {
      findById: jest.fn(),
      findByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(ids.map((id) => ({ id, status: 'ACTIVE' }))),
        ),
    } as unknown as jest.Mocked<RoleRepository>;

    mockOutboxRepo = {
      save: jest.fn(),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    mockImpactService = {
      estimateRoleAssignmentImpact: jest.fn(),
    } as unknown as jest.Mocked<UserGroupImpactService>;

    service = new UserGroupRoleAssignmentService(
      mockTransactionService,
      mockUserGroupRepo,
      mockUserGroupRoleRepo,
      mockRoleRepo,
      mockOutboxRepo,
      mockImpactService,
    );
  });

  it('should throw InvalidRoleAssignmentError when role is inactive', async () => {
    mockUserGroupRepo.findById.mockResolvedValue({
      id: 'group-1',
      version: 1,
    } as never);
    mockRoleRepo.findByIds.mockResolvedValue([
      {
        id: 'role-1',
        name: 'Role 1',
        status: 'INACTIVE',
      } as never,
    ]);

    await expect(
      service.updateRoleAssignments('group-1', {
        roleIds: ['role-1'],
        expectedVersion: 1,
      }),
    ).rejects.toThrow(InvalidRoleAssignmentError);
  });

  it('should throw HighImpactConfirmationRequiredError when impact requires confirmation and confirmed !== true', async () => {
    mockUserGroupRepo.findById.mockResolvedValue({
      id: 'group-1',
      version: 1,
    } as never);
    mockRoleRepo.findByIds.mockResolvedValue([
      {
        id: 'role-1',
        name: 'Role 1',
        status: 'ACTIVE',
      } as never,
    ]);
    mockImpactService.estimateRoleAssignmentImpact.mockResolvedValue({
      affectedUserCount: 150,
      zeroRoleUserCount: 0,
      requiresConfirmation: true,
      threshold: 100,
    });

    await expect(
      service.updateRoleAssignments('group-1', {
        roleIds: ['role-1'],
        expectedVersion: 1,
        confirmed: false,
      }),
    ).rejects.toThrow(HighImpactConfirmationRequiredError);
  });

  it('should successfully update role assignments when confirmed is true', async () => {
    const existingGroup = {
      id: 'group-1',
      tenantCode: 'tenant-1',
      name: 'Test Group',
      status: 'ACTIVE',
      scopeType: 'TENANT_WIDE',
      matchingRule: { clauses: [] },
      ruleAttributeKeys: [],
      version: 1,
      projectionVersion: 0,
    };
    mockUserGroupRepo.findById.mockResolvedValue(existingGroup as never);
    mockRoleRepo.findByIds.mockResolvedValue([
      {
        id: 'role-1',
        name: 'Role 1',
        status: 'ACTIVE',
      } as never,
    ]);
    mockImpactService.estimateRoleAssignmentImpact.mockResolvedValue({
      affectedUserCount: 150,
      zeroRoleUserCount: 0,
      requiresConfirmation: true,
      threshold: 100,
    });
    mockUserGroupRoleRepo.findByGroup.mockResolvedValue([]);

    await service.updateRoleAssignments('group-1', {
      roleIds: ['role-1'],
      expectedVersion: 1,
      confirmed: true,
    });

    expect(mockUserGroupRepo.save).toHaveBeenCalled();
    expect(mockUserGroupRoleRepo.bulkSave).toHaveBeenCalled();
    expect(mockOutboxRepo.save).toHaveBeenCalledTimes(2); // roles assigned + authorization sync
    expect(existingGroup.version).toBe(2);
  });
});
