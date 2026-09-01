import { NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthorizationSyncService } from './authorization-sync.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

describe('AuthorizationSyncService', () => {
  let service: AuthorizationSyncService;
  let mockSyncJobRepo: Partial<AuthorizationSyncJobRepository>;
  let mockUserGroupRepo: Partial<UserGroupRepository>;
  let mockRoleRepo: Partial<RoleRepository>;
  let mockOutboxRepo: Partial<AuthSecurityEventOutboxRepository>;
  let mockTransactionService: Partial<TransactionService>;

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TEST_TENANT');
    jest.spyOn(RequestContextService, 'getUser').mockReturnValue({
      userId: 'user-123',
      tenantCode: 'TEST_TENANT',
    } as unknown as ReturnType<typeof RequestContextService.getUser>);

    mockSyncJobRepo = {
      findInFlightJob: jest.fn(),
      create: jest.fn(),
      findByIdAndTenant: jest.fn(),
    };

    mockUserGroupRepo = {
      findByTenantAndId: jest.fn(),
    };

    mockRoleRepo = {
      findByIdAndTenant: jest.fn(),
    };

    mockOutboxRepo = {
      create: jest.fn(),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
    };

    service = new AuthorizationSyncService(
      mockSyncJobRepo as unknown as AuthorizationSyncJobRepository,
      mockUserGroupRepo as unknown as UserGroupRepository,
      mockRoleRepo as unknown as RoleRepository,
      mockOutboxRepo as unknown as AuthSecurityEventOutboxRepository,
      mockTransactionService as unknown as TransactionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestSyncNow', () => {
    it('should return no-op response when entity is already synchronized', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 2,
        projectionVersion: 2,
      });

      const result = await service.requestSyncNow({
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
      });

      expect(result.isNoOp).toBe(true);
      expect(result.status).toBe(SyncJobStatus.COMPLETED);
      expect(result.jobId).toBeNull();
      expect(mockSyncJobRepo.create).not.toHaveBeenCalled();
    });

    it('should return existing in-flight job if already running', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 3,
        projectionVersion: 2,
      });

      const inFlightJob = {
        id: 'job-existing',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        processedUsers: 10,
        totalUsers: 100,
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(inFlightJob);

      const result = await service.requestSyncNow({
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
      });

      expect(result.isNoOp).toBe(false);
      expect(result.jobId).toBe('job-existing');
      expect(result.status).toBe(SyncJobStatus.PROCESSING);
      expect(mockSyncJobRepo.create).not.toHaveBeenCalled();
    });

    it('should create new sync job and outbox event when dirty', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 3,
        projectionVersion: 2,
      });

      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(null);

      const createdJob = {
        id: 'job-new',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        totalUsers: null,
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.create as jest.Mock).mockResolvedValue(createdJob);

      const result = await service.requestSyncNow({
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
      });

      expect(result.jobId).toBe('job-new');
      expect(result.status).toBe(SyncJobStatus.PENDING);
      expect(mockSyncJobRepo.create).toHaveBeenCalled();
      expect(mockOutboxRepo.create).toHaveBeenCalled();
    });

    it('should catch unique constraint 23505 race condition and return existing in-flight job', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 3,
        projectionVersion: 2,
      });

      (mockSyncJobRepo.findInFlightJob as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'job-raced',
          tenantCode: 'TEST_TENANT',
          sourceType: SyncSourceType.USER_GROUP,
          sourceId: 'ug-1',
          sourceVersion: 3,
          triggerType: SyncTriggerType.MANUAL,
          status: SyncJobStatus.PENDING,
          processedUsers: 0,
        });

      mockTransactionService.runInTransaction = jest.fn().mockRejectedValue({
        code: '23505',
        message: 'duplicate key value violates unique constraint uq_authz_sync_jobs_in_flight',
      });

      const result = await service.requestSyncNow({
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
      });

      expect(result.jobId).toBe('job-raced');
    });

    it('should throw NotFoundException if entity does not exist', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue(null);

      await expect(
        service.requestSyncNow({
          sourceType: SyncSourceType.USER_GROUP,
          sourceId: 'non-existent-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status if found', async () => {
      const mockJob = {
        id: 'job-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        processedUsers: 50,
        totalUsers: 100,
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.findByIdAndTenant as jest.Mock).mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-1');

      expect(result.jobId).toBe('job-1');
      expect(result.status).toBe(SyncJobStatus.PROCESSING);
      expect(result.processedUsers).toBe(50);
      expect(result.totalUsers).toBe(100);
    });

    it('should throw NotFoundException if job not found', async () => {
      (mockSyncJobRepo.findByIdAndTenant as jest.Mock).mockResolvedValue(null);

      await expect(service.getJobStatus('non-existent-job')).rejects.toThrow(NotFoundException);
    });
  });

  describe('enqueueSyncJob', () => {
    it('should successfully enqueue job for SCHEDULED trigger with SYSTEM createdBy', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-2',
        version: 4,
        projectionVersion: 2,
      });

      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(null);

      const createdJob = {
        id: 'job-sched-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-2',
        sourceVersion: 4,
        triggerType: SyncTriggerType.SCHEDULED,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        createdBy: 'SYSTEM',
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.create as jest.Mock).mockResolvedValue(createdJob);

      const result = await service.enqueueSyncJob({
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-2',
        triggerType: SyncTriggerType.SCHEDULED,
        createdBy: 'SYSTEM',
      });

      expect(result.jobId).toBe('job-sched-1');
      expect(result.triggerType).toBe(SyncTriggerType.SCHEDULED);
      expect(mockSyncJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantCode: 'TEST_TENANT',
          triggerType: SyncTriggerType.SCHEDULED,
          createdBy: 'SYSTEM',
        }),
      );
    });

    it('should bypass repository source validation when ignoreValidateSource is true', async () => {
      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(null);

      const createdJob = {
        id: 'job-sched-bypass',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-3',
        sourceVersion: 2,
        triggerType: SyncTriggerType.SCHEDULED,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        createdBy: 'SYSTEM',
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.create as jest.Mock).mockResolvedValue(createdJob);

      const result = await service.enqueueSyncJob({
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-3',
        sourceVersion: 2,
        triggerType: SyncTriggerType.SCHEDULED,
        createdBy: 'SYSTEM',
        ignoreValidateSource: true,
      });

      expect(result.jobId).toBe('job-sched-bypass');
      expect(mockUserGroupRepo.findByTenantAndId).not.toHaveBeenCalled();
      expect(mockRoleRepo.findByIdAndTenant).not.toHaveBeenCalled();
    });

    it('should pass priority through to repository when provided', async () => {
      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(null);

      const createdJob = {
        id: 'job-urgent-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-urgent',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        priority: 'URGENT',
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.create as jest.Mock).mockResolvedValue(createdJob);

      const result = await service.enqueueSyncJob({
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-urgent',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        priority: createdJob.priority,
        ignoreValidateSource: true,
      });

      expect(result.jobId).toBe('job-urgent-1');
      expect(mockSyncJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'URGENT',
        }),
      );
    });
  });

  describe('retryFailedSync', () => {
    it('should throw BadRequestException if entity is already completed (version <= projectionVersion)', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 2,
        projectionVersion: 2,
      });

      await expect(service.retryFailedSync(SyncSourceType.USER_GROUP, 'ug-1')).rejects.toThrow(
        'No failed synchronization found for this entity',
      );
    });

    it('should return existing in-flight job if already running', async () => {
      (mockUserGroupRepo.findByTenantAndId as jest.Mock).mockResolvedValue({
        id: 'ug-1',
        version: 3,
        projectionVersion: 2,
      });

      const inFlightJob = {
        id: 'job-active-retry',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        processedUsers: 0,
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(inFlightJob);

      const result = await service.retryFailedSync(SyncSourceType.USER_GROUP, 'ug-1');

      expect(result.jobId).toBe('job-active-retry');
      expect(result.status).toBe(SyncJobStatus.PROCESSING);
      expect(mockSyncJobRepo.create).not.toHaveBeenCalled();
    });

    it('should enqueue a new manual sync job for failed entity', async () => {
      (mockRoleRepo.findByIdAndTenant as jest.Mock).mockResolvedValue({
        id: 'role-1',
        version: 4,
        projectionVersion: 3,
      });

      (mockSyncJobRepo.findInFlightJob as jest.Mock).mockResolvedValue(null);

      const createdJob = {
        id: 'job-retry-new',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.ROLE,
        sourceId: 'role-1',
        sourceVersion: 4,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        createdBy: 'user-123',
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.create as jest.Mock).mockResolvedValue(createdJob);

      const result = await service.retryFailedSync(SyncSourceType.ROLE, 'role-1');

      expect(result.jobId).toBe('job-retry-new');
      expect(result.status).toBe(SyncJobStatus.PENDING);
      expect(result.triggerType).toBe(SyncTriggerType.MANUAL);
      expect(mockSyncJobRepo.create).toHaveBeenCalled();
      expect(mockOutboxRepo.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if entity does not exist', async () => {
      (mockRoleRepo.findByIdAndTenant as jest.Mock).mockResolvedValue(null);

      await expect(
        service.retryFailedSync(SyncSourceType.ROLE, 'non-existent-role'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
