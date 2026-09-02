import { TransactionService } from '@new-hros/libs-sql';

import { MembershipReconciler } from './membership-reconciler.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { UserGroupRole } from '../entities/user-group-role.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('MembershipReconciler', () => {
  let reconciler: MembershipReconciler;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockUserGroupRoleRepo: jest.Mocked<UserGroupRoleRepository>;
  let mockMembershipRepo: jest.Mocked<UserGroupMembershipRepository>;
  let mockEffectiveRoleRepo: jest.Mocked<UserEffectiveRoleRepository>;
  let mockOutboxRepo: jest.Mocked<AuthSecurityEventOutboxRepository>;

  beforeEach(() => {
    mockTransactionService = {
      getManager: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;
    mockUserGroupRepo = {
      findById: jest.fn(),
      findFullyById: jest.fn(),
      findByTenantAndId: jest.fn(),
      updateProjectionVersion: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;
    mockUserGroupRoleRepo = {
      findRolesByGroupId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;
    mockMembershipRepo = {
      findMembershipsByEmployee: jest.fn(),
      findMemberEmployeeIdsByGroup: jest.fn(),
      insertSingleMembership: jest.fn(),
      deleteSingleMembership: jest.fn(),
      batchInsert: jest.fn(),
      batchDelete: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;
    mockEffectiveRoleRepo = {
      syncEffectiveRolesForEmployee: jest.fn().mockResolvedValue({ inserted: 1, deleted: 0 }),
    } as unknown as jest.Mocked<UserEffectiveRoleRepository>;
    mockOutboxRepo = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    reconciler = new MembershipReconciler(
      mockTransactionService,
      mockUserGroupRepo,
      mockUserGroupRoleRepo,
      mockMembershipRepo,
      mockEffectiveRoleRepo,
      mockOutboxRepo,
    );
  });

  it('reconcileSingleEmployee adds new groups and syncs roles', async () => {
    mockMembershipRepo.findMembershipsByEmployee.mockResolvedValueOnce([]);
    mockUserGroupRepo.findFullyById.mockResolvedValueOnce({
      id: 'grp-1',
      status: 'ACTIVE',
      scopeType: 'DEPARTMENT',
      scopeRefId: 'dept-1',
    } as unknown as UserGroup);
    mockUserGroupRoleRepo.findRolesByGroupId.mockResolvedValueOnce([
      { roleId: 'role-1' } as UserGroupRole,
    ]);

    const result = await reconciler.reconcileSingleEmployee('DEFAULT', 'emp-1', ['grp-1']);

    expect(result.addedGroupIds).toEqual(['grp-1']);
    expect(mockMembershipRepo.insertSingleMembership).toHaveBeenCalledWith('emp-1', 'grp-1');
    expect(mockEffectiveRoleRepo.syncEffectiveRolesForEmployee).toHaveBeenCalledWith('emp-1', [
      {
        roleId: 'role-1',
        sourceGroupId: 'grp-1',
        scopeType: 'DEPARTMENT',
        scopeEntityId: 'dept-1',
      },
    ]);
    expect(mockOutboxRepo.create).toHaveBeenCalled();
  });
});
