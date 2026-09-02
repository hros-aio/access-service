import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupScopeController } from './controllers/user-group-scope.controller';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { ScopeType } from './domain/enums/scope-type.enum';
import {
  ConcurrentModificationError,
  HighImpactConfirmationRequiredError,
  InvalidScopeError,
} from './domain/exceptions/user-group.exceptions';
import { UserGroup } from './entities/user-group.entity';
import { UserGroupMembershipRepository } from './repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from './repositories/user-group-role.repository';
import { UserGroupRepository } from './repositories/user-group.repository';
import { UserGroupImpactService } from './services/user-group-impact.service';
import { UserGroupScopeService } from './services/user-group-scope.service';
import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';

describe('UserGroupScope Integration / Security Isolation', () => {
  let controller: UserGroupScopeController;
  let scopeService: UserGroupScopeService;
  let impactService: UserGroupImpactService;

  let userGroupRepo: jest.Mocked<UserGroupRepository>;
  let userGroupRoleRepo: jest.Mocked<UserGroupRoleRepository>;
  let membershipRepo: jest.Mocked<UserGroupMembershipRepository>;
  let outboxRepo: jest.Mocked<AuthSecurityEventOutboxRepository>;
  let transactionService: jest.Mocked<TransactionService>;

  const tenantA = 'tenant-a';
  const userGroupId = '22222222-2222-2222-2222-222222222222';
  const actorId = 'admin-user-a';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(tenantA);
    jest
      .spyOn(RequestContextService, 'getUser')
      .mockReturnValue({ userId: actorId } as unknown as ReturnType<
        typeof RequestContextService.getUser
      >);

    userGroupRepo = {
      findById: jest.fn(),
      findByTenantAndId: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<UserGroupRepository>;

    userGroupRoleRepo = {
      findByGroup: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserGroupRoleRepository>;

    membershipRepo = {
      countByGroup: jest.fn(),
      findMemberEmployeeIdsByGroup: jest.fn(),
      countZeroRoleMembersAfterUnassign: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    outboxRepo = {
      save: jest.fn().mockResolvedValue({} as unknown as AuthSecurityEventOutbox),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    transactionService = {
      runInTransaction: jest.fn((cb) => cb()),
    } as unknown as jest.Mocked<TransactionService>;

    impactService = new UserGroupImpactService(userGroupRepo, userGroupRoleRepo, membershipRepo);
    scopeService = new UserGroupScopeService(
      transactionService,
      userGroupRepo,
      outboxRepo,
      impactService,
    );
    controller = new UserGroupScopeController(scopeService, impactService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject invalid entity reference ID when updating scope', async () => {
    const existingGroup = new UserGroup();
    existingGroup.id = userGroupId;
    existingGroup.tenantCode = tenantA;
    existingGroup.scopeType = ScopeType.SELF;
    existingGroup.version = 1;
    existingGroup.projectionVersion = 1;
    userGroupRepo.findById.mockResolvedValue(existingGroup);

    await expect(
      controller.updateScope(userGroupId, {
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: '', // Empty reference ID
        expectedVersion: 1,
      }),
    ).rejects.toThrow(InvalidScopeError);
  });

  it('should reject unconfirmed high-impact scope changes (422)', async () => {
    const existingGroup = new UserGroup();
    existingGroup.id = userGroupId;
    existingGroup.tenantCode = tenantA;
    existingGroup.scopeType = ScopeType.SELF;
    existingGroup.version = 1;
    existingGroup.projectionVersion = 1;
    userGroupRepo.findById.mockResolvedValue(existingGroup);
    membershipRepo.countByGroup.mockResolvedValue(5000); // Exceeds threshold (100)

    await expect(
      controller.updateScope(userGroupId, {
        scopeType: ScopeType.TENANT_WIDE,
        expectedVersion: 1,
        confirmed: false,
      }),
    ).rejects.toThrow(HighImpactConfirmationRequiredError);
  });

  it('should handle concurrent modification conflicts (409)', async () => {
    const existingGroup = new UserGroup();
    existingGroup.id = userGroupId;
    existingGroup.tenantCode = tenantA;
    existingGroup.scopeType = ScopeType.SELF;
    existingGroup.version = 3; // Current version is 3
    existingGroup.projectionVersion = 2;
    userGroupRepo.findById.mockResolvedValue(existingGroup);

    await expect(
      controller.updateScope(userGroupId, {
        scopeType: ScopeType.COMPANY,
        scopeRefId: 'comp-10',
        expectedVersion: 2, // Stale version
        confirmed: true,
      }),
    ).rejects.toThrow(ConcurrentModificationError);
  });

  it('should successfully update scope, bump version, and persist outbox audit records', async () => {
    const existingGroup = new UserGroup();
    existingGroup.id = userGroupId;
    existingGroup.tenantCode = tenantA;
    existingGroup.name = 'Finance Team';
    existingGroup.scopeType = ScopeType.SELF;
    existingGroup.scopeRefId = undefined;
    existingGroup.matchingRule = { clauses: [] };
    existingGroup.ruleAttributeKeys = [];
    existingGroup.version = 2;
    existingGroup.projectionVersion = 2;
    userGroupRepo.findById.mockResolvedValue(existingGroup);
    membershipRepo.countByGroup.mockResolvedValue(25); // Below threshold

    const response = await controller.updateScope(userGroupId, {
      scopeType: ScopeType.LOCATION,
      scopeRefId: 'loc-sg-01',
      expectedVersion: 2,
    });

    expect(response.scopeType).toBe(ScopeType.LOCATION);
    expect(response.scopeRefId).toBe('loc-sg-01');
    expect(response.version).toBe(3);
    expect(response.projectionVersion).toBe(2);
    expect(response.isPendingSync).toBe(true);

    expect(userGroupRepo.save).toHaveBeenCalled();
    expect(outboxRepo.save).toHaveBeenCalledTimes(2);
  });
});
