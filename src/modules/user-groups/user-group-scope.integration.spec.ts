import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupScopeController } from './controllers/user-group-scope.controller';
import { ScopeType } from './domain/enums/scope-type.enum';
import {
  ConcurrentModificationError,
  HighImpactConfirmationRequiredError,
  InvalidScopeError,
  UserGroupNotFoundError,
} from './domain/exceptions/user-group.exceptions';
import { UserGroup } from './entities/user-group.entity';
import { UserGroupMembershipRepository } from './repositories/user-group-membership.repository';
import { UserGroupRepository } from './repositories/user-group.repository';
import { UserGroupScopeImpactService } from './services/user-group-scope-impact.service';
import { UserGroupScopeService } from './services/user-group-scope.service';
import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';

describe('UserGroupScope Integration / Security Isolation', () => {
  let controller: UserGroupScopeController;
  let scopeService: UserGroupScopeService;
  let impactService: UserGroupScopeImpactService;

  let userGroupRepo: jest.Mocked<UserGroupRepository>;
  let membershipRepo: jest.Mocked<UserGroupMembershipRepository>;
  let outboxRepo: jest.Mocked<AuthSecurityEventOutboxRepository>;
  let transactionService: jest.Mocked<TransactionService>;

  const tenantA = 'tenant-a';
  const tenantB = 'tenant-b';
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
      findByTenantAndId: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<UserGroupRepository>;

    membershipRepo = {
      countByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    outboxRepo = {
      save: jest.fn().mockResolvedValue({} as unknown as AuthSecurityEventOutbox),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    transactionService = {
      runInTransaction: jest.fn((cb) => cb()),
    } as unknown as jest.Mocked<TransactionService>;

    impactService = new UserGroupScopeImpactService(userGroupRepo, membershipRepo);
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

  it('should strictly isolate tenants and reject cross-tenant scope inspection (404)', async () => {
    // When querying for group in Tenant A, findByTenantAndId returns null if group belongs to Tenant B
    userGroupRepo.findByTenantAndId.mockImplementation(async (t, id) => {
      if (t === tenantB) {
        const g = new UserGroup();
        g.id = id;
        g.tenantCode = tenantB;
        return g;
      }
      return null;
    });

    await expect(controller.getScope(userGroupId)).rejects.toThrow(UserGroupNotFoundError);
    expect(userGroupRepo.findByTenantAndId).toHaveBeenCalledWith(tenantA, userGroupId);
  });

  it('should reject invalid entity reference ID when updating scope', async () => {
    const existingGroup = new UserGroup();
    existingGroup.id = userGroupId;
    existingGroup.tenantCode = tenantA;
    existingGroup.scopeType = ScopeType.SELF;
    existingGroup.version = 1;
    existingGroup.projectionVersion = 1;
    userGroupRepo.findByTenantAndId.mockResolvedValue(existingGroup);

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
    userGroupRepo.findByTenantAndId.mockResolvedValue(existingGroup);
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
    userGroupRepo.findByTenantAndId.mockResolvedValue(existingGroup);

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
    userGroupRepo.findByTenantAndId.mockResolvedValue(existingGroup);
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
