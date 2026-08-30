import { NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { ImpactAnalysisService } from './impact-analysis.service';
import { Role } from '../../roles/entities/role.entity';
import { RoleStatus, SystemRoleKey } from '../../roles/interfaces/system-role-template.interface';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupStatus } from '../../user-groups/domain/enums';
import { MatchingRuleOperator } from '../../user-groups/domain/value-objects/matching-rule.vo';
import { MatchingRuleDto } from '../../user-groups/dto/create-user-group.dto';
import { UserGroup } from '../../user-groups/entities/user-group.entity';
import { UserEffectiveRoleRepository } from '../../user-groups/repositories/user-effective-role.repository';
import { UserGroupMembershipRepository } from '../../user-groups/repositories/user-group-membership.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { UserGroupPopulationQueryService } from '../../user-groups/services/user-group-population-query.service';

describe('ImpactAnalysisService', () => {
  let service: ImpactAnalysisService;
  let roleRepoMock: jest.Mocked<RoleRepository>;
  let userGroupRepoMock: jest.Mocked<UserGroupRepository>;
  let userGroupMembershipRepoMock: jest.Mocked<UserGroupMembershipRepository>;
  let userEffectiveRoleRepoMock: jest.Mocked<UserEffectiveRoleRepository>;
  let populationQueryServiceMock: jest.Mocked<UserGroupPopulationQueryService>;

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');

    roleRepoMock = {
      findById: jest.fn(),
      countActiveUserReach: jest.fn(),
      findActiveBuiltInAdminRoles: jest.fn(),
    } as unknown as jest.Mocked<RoleRepository>;

    userGroupRepoMock = {
      findByTenantAndId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    userGroupMembershipRepoMock = {
      countUserGroupMembers: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    userEffectiveRoleRepoMock = {
      countActiveHoldersByRoleId: jest.fn(),
      countActiveHoldersExcludingSourceGroup: jest.fn(),
    } as unknown as jest.Mocked<UserEffectiveRoleRepository>;

    populationQueryServiceMock = {
      estimateCriteriaDiff: jest.fn(),
    } as unknown as jest.Mocked<UserGroupPopulationQueryService>;

    service = new ImpactAnalysisService(
      roleRepoMock,
      userGroupRepoMock,
      userGroupMembershipRepoMock,
      userEffectiveRoleRepoMock,
      populationQueryServiceMock,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('previewRoleImpact', () => {
    it('should throw NotFoundException if role does not belong to tenant', async () => {
      roleRepoMock.findById.mockResolvedValueOnce(null);

      await expect(service.previewRoleImpact('role-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should return role impact estimate with isHighImpact flag when exceeding threshold', async () => {
      roleRepoMock.findById.mockResolvedValueOnce({
        id: 'role-1',
        tenantCode: 'TENANT_A',
      } as Role);

      roleRepoMock.countActiveUserReach.mockResolvedValueOnce(150);
      roleRepoMock.findActiveBuiltInAdminRoles.mockResolvedValueOnce([]);

      const result = await service.previewRoleImpact('role-1', {});

      expect(result.targetType).toBe('ROLE');
      expect(roleRepoMock.countActiveUserReach).toHaveBeenCalledWith('role-1', 'TENANT_A');
      expect(result.estimate.totalAffected).toBe(150);
      expect(result.estimate.isHighImpact).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('should detect critical capability coverage loss when role deactivation removes the sole admin', async () => {
      roleRepoMock.findById.mockResolvedValueOnce({
        id: 'role-admin',
        tenantCode: 'TENANT_A',
      } as Role);

      roleRepoMock.countActiveUserReach.mockResolvedValueOnce(1);
      roleRepoMock.findActiveBuiltInAdminRoles.mockResolvedValueOnce([
        {
          id: 'role-admin',
          name: 'Administrator',
          systemRoleKey: SystemRoleKey.ADMINISTRATOR,
        } as Role,
      ]);
      userEffectiveRoleRepoMock.countActiveHoldersByRoleId.mockResolvedValueOnce(1);

      const result = await service.previewRoleImpact('role-admin', {
        status: RoleStatus.INACTIVE,
      });

      expect(result.coverageLoss).not.toBeNull();
      expect(result.coverageLoss?.isCriticalLoss).toBe(true);
      expect(result.coverageLoss?.priorHoldersCount).toBe(1);
      expect(result.coverageLoss?.projectedHoldersCount).toBe(0);
    });
  });

  describe('previewUserGroupImpact', () => {
    it('should call populationQueryService.estimateCriteriaDiff directly when matching rule is provided', async () => {
      userGroupRepoMock.findByTenantAndId.mockResolvedValueOnce({
        id: 'group-1',
        tenantCode: 'TENANT_A',
      } as UserGroup);

      populationQueryServiceMock.estimateCriteriaDiff.mockResolvedValueOnce({
        currentCount: 10,
        proposedCount: 15,
        gainingCount: 80,
        losingCount: 30,
      });
      roleRepoMock.findActiveBuiltInAdminRoles.mockResolvedValueOnce([]);

      const matchingRule: MatchingRuleDto = {
        clauses: [
          {
            attribute: 'employmentStatus',
            operator: 'EQUALS' as MatchingRuleOperator,
            value: 'ACTIVE',
          },
        ],
      };

      const result = await service.previewUserGroupImpact('group-1', {
        matchingRule,
      });

      expect(populationQueryServiceMock.estimateCriteriaDiff).toHaveBeenCalledWith(
        'TENANT_A',
        'group-1',
        matchingRule,
      );
      expect(result.targetType).toBe('USER_GROUP');
      expect(result.estimate.usersGaining).toBe(80);
      expect(result.estimate.usersLosing).toBe(30);
      expect(result.estimate.totalAffected).toBe(110);
      expect(result.estimate.isHighImpact).toBe(true);
    });

    it('should query userGroupMembershipRepo.countUserGroupMembers when deactivating group without rule changes', async () => {
      userGroupRepoMock.findByTenantAndId.mockResolvedValueOnce({
        id: 'group-1',
        tenantCode: 'TENANT_A',
      } as UserGroup);

      userGroupMembershipRepoMock.countUserGroupMembers.mockResolvedValueOnce(45);
      roleRepoMock.findActiveBuiltInAdminRoles.mockResolvedValueOnce([]);

      const result = await service.previewUserGroupImpact('group-1', {
        status: UserGroupStatus.INACTIVE,
      });

      expect(userGroupMembershipRepoMock.countUserGroupMembers).toHaveBeenCalledWith(
        'TENANT_A',
        'group-1',
      );
      expect(result.estimate.totalAffected).toBe(45);
      expect(result.estimate.usersLosing).toBe(45);
      expect(result.estimate.isHighImpact).toBe(false);
    });

    it('should detect coverage loss when user group deactivation leaves 0 active admin holders', async () => {
      userGroupRepoMock.findByTenantAndId.mockResolvedValueOnce({
        id: 'group-admin',
        tenantCode: 'TENANT_A',
      } as UserGroup);

      userGroupMembershipRepoMock.countUserGroupMembers.mockResolvedValueOnce(1);
      roleRepoMock.findActiveBuiltInAdminRoles.mockResolvedValueOnce([
        {
          id: 'role-admin',
          name: 'Administrator',
          systemRoleKey: SystemRoleKey.ADMINISTRATOR,
        } as Role,
      ]);
      userEffectiveRoleRepoMock.countActiveHoldersByRoleId.mockResolvedValueOnce(1);
      userEffectiveRoleRepoMock.countActiveHoldersExcludingSourceGroup.mockResolvedValueOnce(0);

      const result = await service.previewUserGroupImpact('group-admin', {
        status: UserGroupStatus.INACTIVE,
      });

      expect(result.coverageLoss).not.toBeNull();
      expect(result.coverageLoss?.isCriticalLoss).toBe(true);
      expect(result.coverageLoss?.priorHoldersCount).toBe(1);
      expect(result.coverageLoss?.projectedHoldersCount).toBe(0);
    });
  });
});
