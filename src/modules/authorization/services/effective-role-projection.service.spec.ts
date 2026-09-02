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

describe('EffectiveRoleProjectionService', () => {
  let service: EffectiveRoleProjectionService;
  let userGroupRepo: Partial<UserGroupRepository>;
  let userGroupRoleRepo: Partial<UserGroupRoleRepository>;
  let membershipRepo: Partial<UserGroupMembershipRepository>;
  let effectiveRoleRepo: Partial<UserEffectiveRoleRepository>;
  let cacheService: Partial<UserAuthorizationCacheService>;

  const tenantCode = 'tenant-xyz';
  const employeeId = 'emp-123';

  beforeEach(async () => {
    userGroupRepo = {
      findById: jest.fn(),
    };
    userGroupRoleRepo = {
      findByGroup: jest.fn(),
    };
    membershipRepo = {
      findMembershipsByEmployee: jest.fn(),
    };
    effectiveRoleRepo = {
      syncUserEffectiveRoles: jest.fn().mockResolvedValue({ inserted: 2, deleted: 0 }),
      deleteByEmployee: jest.fn().mockResolvedValue(2),
    };
    cacheService = {
      syncUserCache: jest.fn().mockResolvedValue({ version: 1, roles: [] }),
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

  it('should recompute multiple roles and scopes across matching active user groups', async () => {
    membershipRepo.findMembershipsByEmployee = jest
      .fn()
      .mockResolvedValue([
        { tenantCode, employeeId, groupId: 'group-a' } as UserGroupMembership,
        { tenantCode, employeeId, groupId: 'group-b' } as UserGroupMembership,
      ]);

    userGroupRepo.findById = jest.fn().mockImplementation((id: string) => {
      if (id === 'group-a') {
        return Promise.resolve({
          id: 'group-a',
          status: 'ACTIVE',
          scopeType: 'SELF',
          scopeRefId: null,
        } as unknown as UserGroup);
      }
      if (id === 'group-b') {
        return Promise.resolve({
          id: 'group-b',
          status: 'ACTIVE',
          scopeType: 'DIRECT_REPORTEES',
          scopeRefId: null,
        } as unknown as UserGroup);
      }
      return Promise.resolve(null);
    });

    userGroupRoleRepo.findByGroup = jest.fn().mockImplementation((id: string) => {
      if (id === 'group-a') {
        return Promise.resolve([{ roleId: 'role-employee' } as UserGroupRole]);
      }
      if (id === 'group-b') {
        return Promise.resolve([{ roleId: 'role-manager' } as UserGroupRole]);
      }
      return Promise.resolve([]);
    });

    const result = await service.recomputeUserEffectiveRoles(tenantCode, employeeId);

    expect(result.activeRolesCount).toBe(2);
    expect(effectiveRoleRepo.syncUserEffectiveRoles).toHaveBeenCalledWith(employeeId, [
      {
        roleId: 'role-employee',
        sourceGroupId: 'group-a',
        scope: { type: 'SELF', refId: null },
      },
      {
        roleId: 'role-manager',
        sourceGroupId: 'group-b',
        scope: { type: 'DIRECT_REPORTEES', refId: null },
      },
    ]);
    expect(cacheService.syncUserCache).toHaveBeenCalledWith(
      tenantCode,
      employeeId,
      expect.arrayContaining([
        expect.objectContaining({ roleId: 'role-employee' }),
        expect.objectContaining({ roleId: 'role-manager' }),
      ]),
    );
  });

  it('should clear all effective roles when matching zero groups', async () => {
    membershipRepo.findMembershipsByEmployee = jest.fn().mockResolvedValue([]);

    const result = await service.recomputeUserEffectiveRoles(tenantCode, employeeId);

    expect(result.activeRolesCount).toBe(0);
    expect(effectiveRoleRepo.deleteByEmployee).toHaveBeenCalledWith(employeeId);
    expect(cacheService.syncUserCache).toHaveBeenCalledWith(tenantCode, employeeId, []);
  });
});
