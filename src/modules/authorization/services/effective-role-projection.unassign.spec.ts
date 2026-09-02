import { Test, TestingModule } from '@nestjs/testing';

import { EffectiveRoleProjectionService } from './effective-role-projection.service';
import { UserAuthorizationCacheService } from './user-authorization-cache.service';
import { UserGroupMembership } from '../../user-groups/entities/user-group-membership.entity';
import { UserGroupRole } from '../../user-groups/entities/user-group-role.entity';
import { UserGroup } from '../../user-groups/entities/user-group.entity';
import { UserGroupMembershipRepository } from '../../user-groups/repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../../user-groups/repositories/user-group-role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { UserEffectiveRoleRepository } from '../repositories/user-effective-role.repository';

describe('EffectiveRoleProjectionService - Unassignment & Partial Revocation', () => {
  let service: EffectiveRoleProjectionService;
  let userGroupRepo: Partial<UserGroupRepository>;
  let userGroupRoleRepo: Partial<UserGroupRoleRepository>;
  let membershipRepo: Partial<UserGroupMembershipRepository>;
  let effectiveRoleRepo: Partial<UserEffectiveRoleRepository>;
  let cacheService: Partial<UserAuthorizationCacheService>;

  const tenantCode = 'tenant-revocation';
  const employeeId = 'emp-unassign';

  beforeEach(async () => {
    userGroupRepo = {
      findFullyById: jest.fn(),
    };
    userGroupRoleRepo = {
      findRolesByGroupId: jest.fn(),
    };
    membershipRepo = {
      findMembershipsByEmployee: jest.fn(),
    };
    effectiveRoleRepo = {
      syncUserEffectiveRoles: jest.fn(),
      deleteByEmployee: jest.fn(),
    };
    cacheService = {
      syncUserCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveRoleProjectionService,
        { provide: UserGroupRepository, useValue: userGroupRepo },
        { provide: UserGroupRoleRepository, useValue: userGroupRoleRepo },
        { provide: UserGroupMembershipRepository, useValue: membershipRepo },
        { provide: UserEffectiveRoleRepository, useValue: effectiveRoleRepo },
        { provide: UserAuthorizationCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<EffectiveRoleProjectionService>(EffectiveRoleProjectionService);
  });

  it('should remove only unassigned group capabilities while retaining remaining active groups', async () => {
    // User was in Group A and Group B, but Group B was removed, leaving only Group A
    membershipRepo.findMembershipsByEmployee = jest
      .fn()
      .mockResolvedValue([{ tenantCode, employeeId, groupId: 'group-a' } as UserGroupMembership]);

    userGroupRepo.findFullyById = jest.fn().mockResolvedValue({
      id: 'group-a',
      status: 'ACTIVE',
      scopeType: 'SELF',
      scopeRefId: null,
    } as unknown as UserGroup);

    userGroupRoleRepo.findRolesByGroupId = jest
      .fn()
      .mockResolvedValue([{ roleId: 'role-employee' } as UserGroupRole]);

    effectiveRoleRepo.syncUserEffectiveRoles = jest.fn().mockResolvedValue({
      inserted: 0,
      deleted: 1, // Manager role from Group B deleted
    });

    const result = await service.recomputeUserEffectiveRoles(tenantCode, employeeId);

    expect(result.inserted).toBe(0);
    expect(result.deleted).toBe(1);
    expect(result.activeRolesCount).toBe(1);

    expect(effectiveRoleRepo.syncUserEffectiveRoles).toHaveBeenCalledWith(tenantCode, employeeId, [
      {
        roleId: 'role-employee',
        sourceGroupId: 'group-a',
        scope: { type: 'SELF', refId: null },
      },
    ]);

    expect(cacheService.syncUserCache).toHaveBeenCalledWith(tenantCode, employeeId, [
      {
        roleId: 'role-employee',
        sourceGroupId: 'group-a',
        scope: { type: 'SELF', refId: null },
      },
    ]);
  });
});
