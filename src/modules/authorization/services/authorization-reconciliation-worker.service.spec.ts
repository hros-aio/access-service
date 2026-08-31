import { TransactionService } from '@new-hros/libs-sql';

import { AuthorizationReconciliationWorker } from './authorization-reconciliation-worker.service';
import { DistributedLockAdapter } from './distributed-lock.adapter';
import { EffectiveRoleProjectionService } from './effective-role-projection.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { MembershipReconciler } from '../../user-groups/services/membership-reconciler.service';
import { UserGroupMatchingEngine } from '../../user-groups/services/user-group-matching.engine';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

describe('AuthorizationReconciliationWorker', () => {
  let worker: AuthorizationReconciliationWorker;
  let mockSyncJobRepo: Partial<AuthorizationSyncJobRepository>;
  let mockUserGroupRepo: Partial<UserGroupRepository>;
  let mockRoleRepo: Partial<RoleRepository>;
  let mockEmployeeRepo: Partial<EmployeeReferenceRepository>;
  let mockUserGroupMatchingEngine: Partial<UserGroupMatchingEngine>;
  let mockMembershipReconciler: Partial<MembershipReconciler>;
  let mockEffectiveRoleProjectionService: Partial<EffectiveRoleProjectionService>;
  let mockOutboxRepo: Partial<AuthSecurityEventOutboxRepository>;
  let mockTransactionService: Partial<TransactionService>;
  let mockLockAdapter: Partial<DistributedLockAdapter>;

  beforeEach(() => {
    mockSyncJobRepo = {
      claimNextPendingJob: jest.fn(),
      updateProgress: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };

    mockUserGroupRepo = {
      findByTenantAndId: jest.fn().mockResolvedValue({
        id: 'ug-1',
        matchingRule: { clauses: [] },
      }),
      updateProjectionVersion: jest.fn(),
    };

    mockRoleRepo = {
      updateProjectionVersion: jest.fn().mockResolvedValue(undefined),
    };

    mockEmployeeRepo = {
      countEmployeesByTenant: jest.fn(),
      findEmployeesBatch: jest.fn(),
    };

    mockUserGroupMatchingEngine = {
      buildMatchingQuery: jest.fn().mockReturnValue({ sql: 'SELECT employee_id', params: [] }),
    };

    mockMembershipReconciler = {
      reconcileGroupPopulation: jest.fn(),
    };

    mockEffectiveRoleProjectionService = {
      recomputeUserEffectiveRoles: jest.fn(),
    };

    mockOutboxRepo = {
      create: jest.fn(),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue({
        query: jest.fn().mockResolvedValue([]),
      }),
    };

    mockLockAdapter = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
    };

    worker = new AuthorizationReconciliationWorker(
      mockSyncJobRepo as unknown as AuthorizationSyncJobRepository,
      mockUserGroupRepo as unknown as UserGroupRepository,
      mockRoleRepo as unknown as RoleRepository,
      mockEmployeeRepo as unknown as EmployeeReferenceRepository,
      mockUserGroupMatchingEngine as unknown as UserGroupMatchingEngine,
      mockMembershipReconciler as unknown as MembershipReconciler,
      mockEffectiveRoleProjectionService as unknown as EffectiveRoleProjectionService,
      mockOutboxRepo as unknown as AuthSecurityEventOutboxRepository,
      mockTransactionService as unknown as TransactionService,
      mockLockAdapter as unknown as DistributedLockAdapter,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processNextJob', () => {
    it('should return false if no pending job exists for tenant', async () => {
      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(true);
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(null);

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(false);
      expect(mockLockAdapter.acquireLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
      expect(mockSyncJobRepo.claimNextPendingJob).toHaveBeenCalledWith('TEST_TENANT');
      expect(mockEmployeeRepo.countEmployeesByTenant).not.toHaveBeenCalled();
      expect(mockLockAdapter.releaseLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
    });

    it('should return false if distributed lock is contended for tenant', async () => {
      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(false);

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(false);
      expect(mockLockAdapter.acquireLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
      expect(mockSyncJobRepo.claimNextPendingJob).not.toHaveBeenCalled();
      expect(mockLockAdapter.releaseLock).not.toHaveBeenCalled();
    });

    it('should execute reconciliation for UserGroup job and mark completed', async () => {
      const job = {
        id: 'job-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        createdBy: 'user-admin',
      } as AuthorizationSyncJob;

      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(true);
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockResolvedValue(2);
      (mockEmployeeRepo.findEmployeesBatch as jest.Mock).mockResolvedValue([
        { employeeId: 'emp-1' },
        { employeeId: 'emp-2' },
      ]);

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(true);
      expect(mockMembershipReconciler.reconcileGroupPopulation).toHaveBeenCalled();
      expect(mockEffectiveRoleProjectionService.recomputeUserEffectiveRoles).toHaveBeenCalledTimes(
        2,
      );
      expect(mockUserGroupRepo.updateProjectionVersion).toHaveBeenCalledWith(
        'TEST_TENANT',
        'ug-1',
        3,
      );
      expect(mockSyncJobRepo.markCompleted).toHaveBeenCalledWith('job-1', 2);
      expect(mockOutboxRepo.create).toHaveBeenCalled();
      expect(mockLockAdapter.releaseLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
    });

    it('should execute reconciliation for Role job and update role projection version', async () => {
      const job = {
        id: 'job-role-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.ROLE,
        sourceId: 'role-1',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        createdBy: 'user-admin',
      } as AuthorizationSyncJob;

      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(true);
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockResolvedValue(1);
      (mockEmployeeRepo.findEmployeesBatch as jest.Mock).mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(true);
      expect(mockMembershipReconciler.reconcileGroupPopulation).not.toHaveBeenCalled();
      expect(mockEffectiveRoleProjectionService.recomputeUserEffectiveRoles).toHaveBeenCalledWith(
        'TEST_TENANT',
        'emp-1',
      );
      expect(mockRoleRepo.updateProjectionVersion).toHaveBeenCalledWith('TEST_TENANT', 'role-1', 2);
      expect(mockSyncJobRepo.markCompleted).toHaveBeenCalledWith('job-role-1', 1);
      expect(mockOutboxRepo.create).toHaveBeenCalled();
      expect(mockLockAdapter.releaseLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
    });

    it('should classify high-impact and long-running jobs in outbox event when thresholds exceeded', async () => {
      const startTime = new Date(Date.now() - 35000); // 35 seconds ago
      const job = {
        id: 'job-high-impact',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        startedAt: startTime,
        createdBy: 'user-admin',
      } as AuthorizationSyncJob;

      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(true);
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockResolvedValue(550); // >= 500 threshold
      const mockBatch = Array.from({ length: 550 }, (_, i) => ({ employeeId: `emp-${i}` }));
      (mockEmployeeRepo.findEmployeesBatch as jest.Mock)
        .mockResolvedValueOnce(mockBatch.slice(0, 500))
        .mockResolvedValueOnce(mockBatch.slice(500, 550))
        .mockResolvedValueOnce([]);

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(true);
      expect(mockOutboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitizedPayload: expect.objectContaining({
            isHighImpact: true,
            isLongRunning: true,
            requiresEmailNotification: true,
          }),
        }),
      );
    });

    it('should handle failure by marking job failed and emitting enriched failure outbox event', async () => {
      const job = {
        id: 'job-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        createdBy: 'user-admin',
      } as AuthorizationSyncJob;

      (mockLockAdapter.acquireLock as jest.Mock).mockResolvedValue(true);
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockRejectedValue(
        new Error('DB Connection Failed'),
      );

      const result = await worker.processNextJob('TEST_TENANT');

      expect(result).toBe(true);
      expect(mockSyncJobRepo.markFailed).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ message: 'DB Connection Failed' }),
      );
      expect(mockOutboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitizedPayload: expect.objectContaining({
            requiresEmailNotification: true,
            errorMessage: 'DB Connection Failed',
          }),
        }),
      );
      expect(mockLockAdapter.releaseLock).toHaveBeenCalledWith(
        'authz:reconciliation-worker:lock:TEST_TENANT',
      );
    });
  });
});
