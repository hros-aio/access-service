import {
  HIGH_IMPACT_ROLE_ASSIGNMENT_THRESHOLD,
  RoleAssignmentImpactService,
} from './role-assignment-impact.service';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('RoleAssignmentImpactService', () => {
  let service: RoleAssignmentImpactService;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockUserGroupRoleRepo: jest.Mocked<UserGroupRoleRepository>;
  let mockUserGroupMembershipRepo: jest.Mocked<UserGroupMembershipRepository>;

  beforeEach(() => {
    mockUserGroupRepo = {
      findByTenantAndId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    mockUserGroupRoleRepo = {
      findByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;

    mockUserGroupMembershipRepo = {
      findMemberEmployeeIdsByGroup: jest.fn(),
      countZeroRoleMembersAfterUnassign: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    service = new RoleAssignmentImpactService(
      mockUserGroupRepo,
      mockUserGroupRoleRepo,
      mockUserGroupMembershipRepo,
    );
  });

  it('should return 0 impact when target roles are identical to current roles', async () => {
    mockUserGroupRepo.findByTenantAndId.mockResolvedValue({ id: 'group-1' } as never);
    mockUserGroupRoleRepo.findByGroup.mockResolvedValue([
      { roleId: 'role-1' },
      { roleId: 'role-2' },
    ] as never);

    const result = await service.estimateRoleAssignmentImpact('group-1', ['role-1', 'role-2']);

    expect(result.affectedUserCount).toBe(0);
    expect(result.zeroRoleUserCount).toBe(0);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('should flag requiresConfirmation when affected users exceed threshold', async () => {
    mockUserGroupRepo.findByTenantAndId.mockResolvedValue({ id: 'group-1' } as never);
    mockUserGroupRoleRepo.findByGroup.mockResolvedValue([{ roleId: 'role-1' }] as never);

    // Generate 150 members
    const members = Array.from({ length: 150 }, (_, i) => `emp-${i}`);
    mockUserGroupMembershipRepo.findMemberEmployeeIdsByGroup.mockResolvedValue(members);

    const result = await service.estimateRoleAssignmentImpact('group-1', ['role-2']);

    expect(result.affectedUserCount).toBe(150);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.threshold).toBe(HIGH_IMPACT_ROLE_ASSIGNMENT_THRESHOLD);
  });

  it('should identify zero-role users when removing roles', async () => {
    mockUserGroupRepo.findByTenantAndId.mockResolvedValue({ id: 'group-1' } as never);
    mockUserGroupRoleRepo.findByGroup.mockResolvedValue([{ roleId: 'role-1' }] as never);
    mockUserGroupMembershipRepo.findMemberEmployeeIdsByGroup.mockResolvedValue([
      'emp-1',
      'emp-2',
      'emp-3',
    ]);
    mockUserGroupMembershipRepo.countZeroRoleMembersAfterUnassign.mockResolvedValue(2);

    const result = await service.estimateRoleAssignmentImpact('group-1', []);

    expect(result.affectedUserCount).toBe(3);
    expect(result.zeroRoleUserCount).toBe(2);
    expect(result.requiresConfirmation).toBe(false);
    expect(mockUserGroupMembershipRepo.countZeroRoleMembersAfterUnassign).toHaveBeenCalled();
  });
});
