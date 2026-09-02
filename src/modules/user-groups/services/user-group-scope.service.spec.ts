import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupImpactService } from './user-group-impact.service';
import { UserGroupScopeService } from './user-group-scope.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { ScopeType } from '../domain/enums/scope-type.enum';
import {
  ConcurrentModificationError,
  HighImpactConfirmationRequiredError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupScopeService', () => {
  let service: UserGroupScopeService;
  let transactionService: jest.Mocked<TransactionService>;
  let userGroupRepo: jest.Mocked<UserGroupRepository>;
  let outboxRepo: jest.Mocked<AuthSecurityEventOutboxRepository>;
  let impactService: jest.Mocked<UserGroupImpactService>;

  const tenantCode = 'tenant-test';
  const userGroupId = '11111111-1111-1111-1111-111111111111';
  const userId = 'admin-user-id';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(tenantCode);
    jest
      .spyOn(RequestContextService, 'getUser')
      .mockReturnValue({ userId } as unknown as ReturnType<typeof RequestContextService.getUser>);

    transactionService = {
      runInTransaction: jest.fn((cb) => cb()),
    } as unknown as jest.Mocked<TransactionService>;

    userGroupRepo = {
      findById: jest.fn(),
      findByTenantAndId: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<UserGroupRepository>;

    outboxRepo = {
      save: jest.fn().mockResolvedValue({} as unknown as AuthSecurityEventOutbox),
    } as unknown as jest.Mocked<AuthSecurityEventOutboxRepository>;

    impactService = {
      estimateScopeImpact: jest.fn(),
    } as unknown as jest.Mocked<UserGroupImpactService>;

    service = new UserGroupScopeService(
      transactionService,
      userGroupRepo,
      outboxRepo,
      impactService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getScope', () => {
    it('should throw UserGroupNotFoundError if group is missing', async () => {
      userGroupRepo.findById.mockResolvedValue(null);

      await expect(service.getScope(userGroupId)).rejects.toThrow(UserGroupNotFoundError);
    });

    it('should return scope details for existing group', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.scopeType = ScopeType.DEPARTMENT;
      mockGroup.scopeRefId = 'dept-01';
      mockGroup.version = 3;
      mockGroup.projectionVersion = 2;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      const result = await service.getScope(userGroupId);

      expect(result).toEqual({
        userGroupId,
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: 'dept-01',
        version: 3,
        projectionVersion: 2,
        isPendingSync: true,
      });
    });
  });

  describe('updateScope', () => {
    it('should throw ConcurrentModificationError if version does not match expectedVersion', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.version = 2;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      await expect(
        service.updateScope(userGroupId, {
          scopeType: ScopeType.COMPANY,
          scopeRefId: 'comp-1',
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ConcurrentModificationError);
    });

    it('should throw HighImpactConfirmationRequiredError if confirmation is required but not provided', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.version = 2;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      impactService.estimateScopeImpact.mockResolvedValue({
        userGroupId,
        affectedUserCount: 500,
        threshold: 100,
        requiresConfirmation: true,
        currentScope: { scopeType: ScopeType.SELF, scopeRefId: null },
        proposedScope: { scopeType: ScopeType.TENANT_WIDE, scopeRefId: null },
      });

      await expect(
        service.updateScope(userGroupId, {
          scopeType: ScopeType.TENANT_WIDE,
          expectedVersion: 2,
          confirmed: false,
        }),
      ).rejects.toThrow(HighImpactConfirmationRequiredError);
    });

    it('should update scope, bump version, and persist outbox events when confirmed', async () => {
      const mockGroup = new UserGroup();
      mockGroup.id = userGroupId;
      mockGroup.tenantCode = tenantCode;
      mockGroup.name = 'Engineering';
      mockGroup.scopeType = ScopeType.SELF;
      mockGroup.scopeRefId = undefined;
      mockGroup.matchingRule = { clauses: [] };
      mockGroup.ruleAttributeKeys = [];
      mockGroup.version = 2;
      mockGroup.projectionVersion = 2;
      userGroupRepo.findById.mockResolvedValue(mockGroup);

      impactService.estimateScopeImpact.mockResolvedValue({
        userGroupId,
        affectedUserCount: 500,
        threshold: 100,
        requiresConfirmation: true,
        currentScope: { scopeType: ScopeType.SELF, scopeRefId: null },
        proposedScope: { scopeType: ScopeType.DEPARTMENT, scopeRefId: 'dept-01' },
      });

      const result = await service.updateScope(userGroupId, {
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: 'dept-01',
        expectedVersion: 2,
        confirmed: true,
      });

      expect(result.scopeType).toBe(ScopeType.DEPARTMENT);
      expect(result.scopeRefId).toBe('dept-01');
      expect(result.version).toBe(3);
      expect(result.projectionVersion).toBe(2);
      expect(result.isPendingSync).toBe(true);

      expect(userGroupRepo.save).toHaveBeenCalled();
      expect(outboxRepo.save).toHaveBeenCalledTimes(2);
    });
  });
});
