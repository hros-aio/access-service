import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutboxRepository } from '../../src/modules/auth/repositories/auth-security-event-outbox.repository';
import {
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../../src/modules/authorization/entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../../src/modules/authorization/repositories/authorization-sync-job.repository';
import { AuthorizationSyncService } from '../../src/modules/authorization/services/authorization-sync.service';
import { DistributedLockAdapter } from '../../src/modules/authorization/services/distributed-lock.adapter';
import { ScheduledReconciliationScanner } from '../../src/modules/authorization/services/scheduled-reconciliation-scanner.service';
import { ScheduledReconciliationMetrics } from '../../src/modules/authorization/telemetry/scheduled-reconciliation.metrics';
import { RoleRepository } from '../../src/modules/roles/repositories/role.repository';
import { UserGroupRepository } from '../../src/modules/user-groups/repositories/user-group.repository';

describe('Scheduled Authorization Reconciliation (E2E Integration Flow)', () => {
  let scanner: ScheduledReconciliationScanner;
  let mockLockAdapter: Partial<DistributedLockAdapter>;
  let mockUserGroupRepo: Partial<UserGroupRepository>;
  let mockRoleRepo: Partial<RoleRepository>;
  let mockSyncJobRepo: Partial<AuthorizationSyncJobRepository>;
  let mockOutboxRepo: Partial<AuthSecurityEventOutboxRepository>;
  let mockTransactionService: Partial<TransactionService>;

  beforeEach(async () => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');

    mockLockAdapter = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
    };

    mockUserGroupRepo = {
      findDirtyUserGroups: jest.fn().mockResolvedValue([
        { tenantCode: 'TENANT_A', id: 'ug-1', version: 3 },
        { tenantCode: 'TENANT_B', id: 'ug-2', version: 2 },
      ]),
      findByTenantAndId: jest.fn().mockImplementation(async (tenantCode: string, id: string) => {
        if (id === 'ug-1') return { id: 'ug-1', tenantCode, version: 3, projectionVersion: 1 };
        if (id === 'ug-2') return { id: 'ug-2', tenantCode, version: 2, projectionVersion: 1 };
        return null;
      }),
    };

    mockRoleRepo = {
      findDirtyRoles: jest.fn().mockResolvedValue([]),
      findByIdAndTenant: jest.fn().mockResolvedValue(null),
    };

    mockSyncJobRepo = {
      findInFlightJob: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (data) => ({
        id: `job-${data.sourceId}`,
        ...data,
        status: SyncJobStatus.PENDING,
      })),
    };

    mockOutboxRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue({ query: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledReconciliationScanner,
        AuthorizationSyncService,
        ScheduledReconciliationMetrics,
        { provide: DistributedLockAdapter, useValue: mockLockAdapter },
        { provide: UserGroupRepository, useValue: mockUserGroupRepo },
        { provide: RoleRepository, useValue: mockRoleRepo },
        { provide: AuthorizationSyncJobRepository, useValue: mockSyncJobRepo },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepo },
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    scanner = module.get<ScheduledReconciliationScanner>(ScheduledReconciliationScanner);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should run end-to-end scheduled reconciliation sweep and isolate tenant batches', async () => {
    const sweepResult = await scanner.handleCron();

    expect(sweepResult.lockAcquired).toBe(true);
    expect(sweepResult.tenantsScanned).toBe(2);
    expect(sweepResult.dirtyGroupsFound).toBe(2);
    expect(sweepResult.jobsEnqueued).toBe(2);

    expect(mockSyncJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT_A',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.SCHEDULED,
        createdBy: 'SYSTEM',
      }),
    );

    expect(mockSyncJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT_B',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-2',
        sourceVersion: 2,
        triggerType: SyncTriggerType.SCHEDULED,
        createdBy: 'SYSTEM',
      }),
    );

    expect(mockOutboxRepo.create).toHaveBeenCalledTimes(2);
    expect(mockLockAdapter.releaseLock).toHaveBeenCalled();
  });
});
