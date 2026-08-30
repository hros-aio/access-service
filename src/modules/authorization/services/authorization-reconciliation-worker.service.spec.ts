import { TransactionService } from '@new-hros/libs-sql';

import { AuthorizationReconciliationWorker } from './authorization-reconciliation-worker.service';
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

    mockRoleRepo = {};

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
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processNextJob', () => {
    it('should return false if no pending job exists', async () => {
      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(null);

      const result = await worker.processNextJob();

      expect(result).toBe(false);
      expect(mockEmployeeRepo.countEmployeesByTenant).not.toHaveBeenCalled();
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

      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockResolvedValue(2);
      (mockEmployeeRepo.findEmployeesBatch as jest.Mock).mockResolvedValue([
        { employeeId: 'emp-1' },
        { employeeId: 'emp-2' },
      ]);

      const result = await worker.processNextJob();

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
    });

    it('should handle failure by marking job failed and emitting outbox event', async () => {
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

      (mockSyncJobRepo.claimNextPendingJob as jest.Mock).mockResolvedValue(job);
      (mockEmployeeRepo.countEmployeesByTenant as jest.Mock).mockRejectedValue(
        new Error('DB Connection Failed'),
      );

      const result = await worker.processNextJob();

      expect(result).toBe(true);
      expect(mockSyncJobRepo.markFailed).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ message: 'DB Connection Failed' }),
      );
      expect(mockOutboxRepo.create).toHaveBeenCalled();
    });
  });
});
