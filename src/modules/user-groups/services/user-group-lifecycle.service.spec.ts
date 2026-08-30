import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupImpactService } from './user-group-impact.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { ScopeType, UserGroupStatus } from '../domain/enums';
import {
  ConcurrentModificationError,
  DuplicateUserGroupNameError,
  InvalidStateTransitionError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { CreateUserGroupDto, UpdateUserGroupDto } from '../dto';
import { UserGroupLifecycleService } from './user-group-lifecycle.service';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from '../repositories/user-group-role.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupLifecycleService', () => {
  let service: UserGroupLifecycleService;
  let userGroupRepository: jest.Mocked<UserGroupRepository>;
  let userGroupRoleRepository: jest.Mocked<UserGroupRoleRepository>;
  let userGroupMembershipRepository: jest.Mocked<UserGroupMembershipRepository>;
  let outboxRepository: jest.Mocked<AuthSecurityEventOutboxRepository>;
  let transactionService: jest.Mocked<TransactionService>;
  let userGroupImpactService: jest.Mocked<UserGroupImpactService>;

  const mockTenantCode = 'tenant-001';
  const mockUserId = 'user-admin-01';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(mockTenantCode);
    jest.spyOn(RequestContextService, 'getUser').mockReturnValue({
      userId: mockUserId,
      sessionId: 'session-01',
      tenantCode: mockTenantCode,
      roles: ['ADMINISTRATOR'],
      scopes: [],
      permissions: [],
    });

    userGroupRepository = {
      findByTenantAndId: jest.fn(),
      findByTenantAndName: jest.fn(),
      listByTenant: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((entity: Partial<UserGroup>) =>
          Promise.resolve({ id: 'group-uuid-1', ...entity } as UserGroup),
        ),
      save: jest.fn().mockImplementation((entity: UserGroup) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<UserGroupRepository>;

    userGroupRoleRepository = {
      findByGroup: jest.fn(),
      deleteByGroup: jest.fn(),
      batchDelete: jest.fn().mockResolvedValue(undefined),
      bulkSave: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;

    userGroupMembershipRepository = {
      countByGroup: jest.fn().mockResolvedValue(10),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    outboxRepository = {
      save: jest.fn().mockResolvedValue({} as AuthSecurityEventOutbox),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    transactionService = {
      runInTransaction: jest.fn().mockImplementation((cb: () => unknown) => cb()),
    } as unknown as jest.Mocked<TransactionService>;

    userGroupImpactService = {} as unknown as jest.Mocked<UserGroupImpactService>;

    service = new UserGroupLifecycleService(
      transactionService,
      userGroupRepository,
      userGroupRoleRepository,
      userGroupMembershipRepository,
      outboxRepository,
      userGroupImpactService,
    );
  });

  describe('createUserGroup', () => {
    const validDto: CreateUserGroupDto = {
      name: 'Engineering Staff',
      description: 'All engineers',
      scopeType: ScopeType.DEPARTMENT,
      scopeRefId: 'dept-eng',
      matchingRule: {
        clauses: [
          { attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' },
          { attribute: 'departmentId', operator: 'EQUALS', value: 'dept-eng' },
        ],
      },
      roleIds: ['role-uuid-1', 'role-uuid-2'],
    };

    it('should create group with version 1, projectionVersion 0 and outbox events', async () => {
      userGroupRepository.findByTenantAndName.mockResolvedValue(null);
      userGroupRepository.findByTenantAndId.mockResolvedValue({
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        name: validDto.name,
        description: validDto.description,
        status: UserGroupStatus.ACTIVE,
        scopeType: validDto.scopeType,
        scopeRefId: validDto.scopeRefId,
        matchingRule: validDto.matchingRule,
        ruleAttributeKeys: ['employmentStatus', 'departmentId'],
        version: 1,
        projectionVersion: 0,
      } as UserGroup);

      const result = await service.createUserGroup(validDto);

      expect(result.id).toEqual('group-uuid-1');
      expect(result.version).toEqual(1);
      expect(result.projectionVersion).toEqual(0);
      expect(outboxRepository.save).toHaveBeenCalled();
    });

    it('should reject creation if group name already exists in tenant', async () => {
      userGroupRepository.findByTenantAndName.mockResolvedValue({ id: 'existing-id' } as UserGroup);

      await expect(service.createUserGroup(validDto)).rejects.toThrow(DuplicateUserGroupNameError);
    });
  });

  describe('updateUserGroup', () => {
    const updateDto: UpdateUserGroupDto = {
      name: 'Engineering Leads',
      description: 'Updated description',
      scopeType: ScopeType.COMPANY,
      matchingRule: {
        clauses: [
          { attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' },
          { attribute: 'hasReportees', operator: 'IS_TRUE' },
        ],
      },
      roleIds: ['role-uuid-3'],
      version: 1,
    };

    it('should update group and increment version', async () => {
      const existingGroup = {
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        name: 'Engineering Staff',
        status: UserGroupStatus.ACTIVE,
        scopeType: ScopeType.DEPARTMENT,
        matchingRule: {
          clauses: [{ attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' }],
        },
        ruleAttributeKeys: ['employmentStatus'],
        version: 1,
        projectionVersion: 0,
        groupRoles: [{ roleId: 'role-uuid-1' }],
      } as unknown as UserGroup;

      userGroupRepository.findByTenantAndId.mockResolvedValue(existingGroup);
      userGroupRepository.findByTenantAndName.mockResolvedValue(null);

      await service.updateById('group-uuid-1', updateDto, 1);

      expect(existingGroup.version).toEqual(2);
      expect(outboxRepository.save).toHaveBeenCalled();
    });

    it('should throw ConcurrentModificationError if version token does not match', async () => {
      userGroupRepository.findByTenantAndId.mockResolvedValue({
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        version: 2,
      } as UserGroup);

      await expect(service.updateById('group-uuid-1', updateDto, 1)).rejects.toThrow(
        ConcurrentModificationError,
      );
    });

    it('should throw UserGroupNotFoundError if group does not exist', async () => {
      userGroupRepository.findByTenantAndId.mockResolvedValue(null);

      await expect(service.updateById('group-uuid-1', updateDto, 1)).rejects.toThrow(
        UserGroupNotFoundError,
      );
    });
  });

  describe('deactivateUserGroup & reactivateUserGroup', () => {
    it('should transition status to INACTIVE and increment version', async () => {
      const existingGroup = {
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        name: 'Engineering Staff',
        status: UserGroupStatus.ACTIVE,
        scopeType: ScopeType.DEPARTMENT,
        matchingRule: {
          clauses: [{ attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' }],
        },
        version: 2,
        projectionVersion: 0,
      } as unknown as UserGroup;

      userGroupRepository.findByTenantAndId.mockResolvedValue(existingGroup);

      await service.deactivate('group-uuid-1', 2);

      expect(existingGroup.status).toEqual(UserGroupStatus.INACTIVE);
      expect(existingGroup.version).toEqual(3);
    });

    it('should reject deactivation if already inactive', async () => {
      const existingGroup = {
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        status: UserGroupStatus.INACTIVE,
        version: 1,
      } as unknown as UserGroup;

      userGroupRepository.findByTenantAndId.mockResolvedValue(existingGroup);

      await expect(service.deactivate('group-uuid-1', 1)).rejects.toThrow(
        InvalidStateTransitionError,
      );
    });

    it('should transition status to ACTIVE on reactivate and increment version', async () => {
      const existingGroup = {
        id: 'group-uuid-1',
        tenantCode: mockTenantCode,
        name: 'Engineering Staff',
        status: UserGroupStatus.INACTIVE,
        scopeType: ScopeType.DEPARTMENT,
        matchingRule: {
          clauses: [{ attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' }],
        },
        version: 3,
        projectionVersion: 0,
      } as unknown as UserGroup;

      userGroupRepository.findByTenantAndId.mockResolvedValue(existingGroup);

      await service.reactivate('group-uuid-1', 3);

      expect(existingGroup.status).toEqual(UserGroupStatus.ACTIVE);
      expect(existingGroup.version).toEqual(4);
    });
  });
});
