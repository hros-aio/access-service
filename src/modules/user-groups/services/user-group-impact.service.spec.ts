import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupImpactService } from './user-group-impact.service';
import { ScopeType } from '../domain/enums/scope-type.enum';
import {
  InvalidScopeError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { UserGroupRole } from '../entities/user-group-role.entity';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupImpactService', () => {
  let service: UserGroupImpactService;
  let userGroupRepo: jest.Mocked<UserGroupRepository>;
  let userGroupRoleRepo: jest.Mocked<UserGroupRoleRepository>;
  let membershipRepo: jest.Mocked<UserGroupMembershipRepository>;

  const tenantCode = 'test-tenant';
  const userGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(tenantCode);

    userGroupRepo = {
      findById: jest.fn(),
      findByTenantAndId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    userGroupRoleRepo = {
      findByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;

    membershipRepo = {
      countByGroup: jest.fn(),
      findMemberEmployeeIdsByGroup: jest.fn(),
      countZeroRoleMembersAfterUnassign: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    service = new UserGroupImpactService(userGroupRepo, userGroupRoleRepo, membershipRepo);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('estimateRoleAssignmentImpact', () => {
    it('should return 0 impact if group does not exist', async () => {
      userGroupRepo.findById.mockResolvedValue(null);

      const result = await service.estimateRoleAssignmentImpact(userGroupId, ['role-1']);

      expect(result).toEqual({
        affectedUserCount: 0,
        zeroRoleUserCount: 0,
        requiresConfirmation: false,
        threshold: 100,
      });
    });

    it('should return 0 impact if target roles match current roles exactly', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      const ugr1 = new UserGroupRole();
      ugr1.roleId = 'role-1';
      userGroupRoleRepo.findByGroup.mockResolvedValue([ugr1]);

      const result = await service.estimateRoleAssignmentImpact(userGroupId, ['role-1']);

      expect(result).toEqual({
        affectedUserCount: 0,
        zeroRoleUserCount: 0,
        requiresConfirmation: false,
        threshold: 100,
      });
    });

    it('should calculate affected users and zero-role users on role unassignment', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      const ugr1 = new UserGroupRole();
      ugr1.roleId = 'role-1';
      userGroupRoleRepo.findByGroup.mockResolvedValue([ugr1]);

      membershipRepo.findMemberEmployeeIdsByGroup.mockResolvedValue(['emp-1', 'emp-2']);
      membershipRepo.countZeroRoleMembersAfterUnassign.mockResolvedValue(1);

      const result = await service.estimateRoleAssignmentImpact(userGroupId, []);

      expect(result).toEqual({
        affectedUserCount: 2,
        zeroRoleUserCount: 1,
        requiresConfirmation: false,
        threshold: 100,
      });
    });
  });

  describe('estimateScopeImpact', () => {
    it('should throw UserGroupNotFoundError if user group does not exist', async () => {
      userGroupRepo.findById.mockResolvedValue(null);

      await expect(
        service.estimateScopeImpact(userGroupId, ScopeType.DEPARTMENT, 'dept-1'),
      ).rejects.toThrow(UserGroupNotFoundError);
    });

    it('should throw InvalidScopeError if proposed scope is invalid', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.scopeType = ScopeType.SELF;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      await expect(
        service.estimateScopeImpact(userGroupId, ScopeType.DEPARTMENT, null),
      ).rejects.toThrow(InvalidScopeError);
    });

    it('should return impact estimate below threshold (requiresConfirmation: false)', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.scopeType = ScopeType.SELF;
      mockGroup.scopeRefId = undefined;
      userGroupRepo.findById.mockResolvedValue(mockGroup);
      membershipRepo.countByGroup.mockResolvedValue(45);

      const result = await service.estimateScopeImpact(userGroupId, ScopeType.COMPANY, 'comp-10');

      expect(result).toEqual({
        userGroupId,
        affectedUserCount: 45,
        threshold: 100,
        requiresConfirmation: false,
        currentScope: {
          scopeType: ScopeType.SELF,
          scopeRefId: null,
        },
        proposedScope: {
          scopeType: ScopeType.COMPANY,
          scopeRefId: 'comp-10',
        },
      });
    });

    it('should flag requiresConfirmation: true when affected users >= threshold', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.scopeType = ScopeType.DEPARTMENT;
      mockGroup.scopeRefId = 'dept-01';
      userGroupRepo.findById.mockResolvedValue(mockGroup);
      membershipRepo.countByGroup.mockResolvedValue(5000);

      const result = await service.estimateScopeImpact(userGroupId, ScopeType.TENANT_WIDE);

      expect(result.requiresConfirmation).toBe(true);
      expect(result.affectedUserCount).toBe(5000);
      expect(result.proposedScope).toEqual({
        scopeType: ScopeType.TENANT_WIDE,
        scopeRefId: null,
      });
    });
  });
});
