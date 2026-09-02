import { NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { SyncStatusProjectionService } from './sync-status-projection.service';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { NextExpectedSyncMethod, SyncComputedStatus } from '../dto/sync-status-response.dto';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

describe('SyncStatusProjectionService', () => {
  let service: SyncStatusProjectionService;
  let mockSyncJobRepo: Partial<AuthorizationSyncJobRepository>;
  let mockUserGroupRepo: Partial<UserGroupRepository>;
  let mockRoleRepo: Partial<RoleRepository>;

  const tenantCode = 'TEST_TENANT';
  const userGroupId = 'ug-uuid-1';
  const roleId = 'role-uuid-1';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(tenantCode);

    mockSyncJobRepo = {
      findLatestJobBySource: jest.fn(),
      findLatestCompletedJobBySource: jest.fn(),
    };

    mockUserGroupRepo = {
      findById: jest.fn(),
      findActiveGroups: jest.fn(),
    };

    mockRoleRepo = {
      findById: jest.fn(),
      find: jest.fn(),
    };

    service = new SyncStatusProjectionService(
      mockSyncJobRepo as AuthorizationSyncJobRepository,
      mockUserGroupRepo as UserGroupRepository,
      mockRoleRepo as RoleRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEntitySyncStatus', () => {
    it('should throw NotFoundException if entity is not found', async () => {
      (mockUserGroupRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getEntitySyncStatus(SyncSourceType.USER_GROUP, userGroupId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return COMPLETED status when version == projectionVersion and no active job', async () => {
      (mockUserGroupRepo.findById as jest.Mock).mockResolvedValue({
        id: userGroupId,
        tenantCode,
        version: 3,
        projectionVersion: 3,
      });

      const completedJob = {
        id: 'job-c1',
        status: SyncJobStatus.COMPLETED,
        completedAt: new Date('2026-08-30T10:00:00Z'),
        processedUsers: 150,
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.findLatestJobBySource as jest.Mock).mockResolvedValue(completedJob);
      (mockSyncJobRepo.findLatestCompletedJobBySource as jest.Mock).mockResolvedValue(completedJob);

      const result = await service.getEntitySyncStatus(SyncSourceType.USER_GROUP, userGroupId);

      expect(result.status).toBe(SyncComputedStatus.COMPLETED);
      expect(result.nextExpectedSyncMethod).toBe(NextExpectedSyncMethod.NONE);
      expect(result.lastSuccessfulSyncAt).toEqual(new Date('2026-08-30T10:00:00Z'));
      expect(result.affectedUserCount).toBe(150);
      expect(result.activeJob).toBeNull();
    });

    it('should return PENDING status with SCHEDULED_DAILY when version > projectionVersion and no active job', async () => {
      (mockUserGroupRepo.findById as jest.Mock).mockResolvedValue({
        id: userGroupId,
        tenantCode,
        version: 4,
        projectionVersion: 3,
      });

      const completedJob = {
        id: 'job-c1',
        status: SyncJobStatus.COMPLETED,
        completedAt: new Date('2026-08-30T10:00:00Z'),
        processedUsers: 150,
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.findLatestJobBySource as jest.Mock).mockResolvedValue(completedJob);
      (mockSyncJobRepo.findLatestCompletedJobBySource as jest.Mock).mockResolvedValue(completedJob);

      const result = await service.getEntitySyncStatus(SyncSourceType.USER_GROUP, userGroupId);

      expect(result.status).toBe(SyncComputedStatus.PENDING);
      expect(result.nextExpectedSyncMethod).toBe(NextExpectedSyncMethod.SCHEDULED_DAILY);
      expect(result.activeJob).toBeNull();
    });

    it('should return PROCESSING status with MANUAL_IN_FLIGHT when active job is processing', async () => {
      (mockRoleRepo.findById as jest.Mock).mockResolvedValue({
        id: roleId,
        version: 2,
        projectionVersion: 1,
      });

      const processingJob = {
        id: 'job-p1',
        status: SyncJobStatus.PROCESSING,
        triggerType: SyncTriggerType.MANUAL,
        processedUsers: 50,
        totalUsers: 200,
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.findLatestJobBySource as jest.Mock).mockResolvedValue(processingJob);
      (mockSyncJobRepo.findLatestCompletedJobBySource as jest.Mock).mockResolvedValue(null);

      const result = await service.getEntitySyncStatus(SyncSourceType.ROLE, roleId);

      expect(result.status).toBe(SyncComputedStatus.PROCESSING);
      expect(result.nextExpectedSyncMethod).toBe(NextExpectedSyncMethod.MANUAL_IN_FLIGHT);
      expect(result.activeJob).toEqual({
        jobId: 'job-p1',
        triggerType: SyncTriggerType.MANUAL,
        progress: {
          processed: 50,
          total: 200,
        },
        error: null,
        retryable: false,
      });
    });

    it('should return FAILED status with error details and retryable=true when latest job failed', async () => {
      (mockUserGroupRepo.findById as jest.Mock).mockResolvedValue({
        id: userGroupId,
        tenantCode,
        version: 3,
        projectionVersion: 2,
      });

      const failedJob = {
        id: 'job-f1',
        status: SyncJobStatus.FAILED,
        triggerType: SyncTriggerType.MANUAL,
        processedUsers: 0,
        totalUsers: 100,
        errorDetails: {
          code: 'EVALUATION_TIMEOUT',
          message: 'Matching query timed out',
        },
      } as unknown as AuthorizationSyncJob;

      (mockSyncJobRepo.findLatestJobBySource as jest.Mock).mockResolvedValue(failedJob);
      (mockSyncJobRepo.findLatestCompletedJobBySource as jest.Mock).mockResolvedValue(null);

      const result = await service.getEntitySyncStatus(SyncSourceType.USER_GROUP, userGroupId);

      expect(result.status).toBe(SyncComputedStatus.FAILED);
      expect(result.nextExpectedSyncMethod).toBe(NextExpectedSyncMethod.SCHEDULED_DAILY);
      expect(result.activeJob).toEqual({
        jobId: 'job-f1',
        triggerType: SyncTriggerType.MANUAL,
        progress: {
          processed: 0,
          total: 100,
        },
        error: {
          code: 'EVALUATION_TIMEOUT',
          message: 'Matching query timed out',
        },
        retryable: true,
      });
    });
  });

  describe('getTenantSummary', () => {
    it('should compute aggregate counts across all active User Groups and Roles', async () => {
      (mockUserGroupRepo.findActiveGroups as jest.Mock).mockResolvedValue([
        { id: 'ug-1', version: 2, projectionVersion: 2 }, // Completed
        { id: 'ug-2', version: 3, projectionVersion: 2 }, // Pending
      ]);

      (mockRoleRepo.find as jest.Mock).mockResolvedValue([
        { id: 'role-1', version: 1, projectionVersion: 1 }, // Completed
        { id: 'role-2', version: 2, projectionVersion: 1 }, // Failed
      ]);

      // Return mock jobs for each entity
      (mockSyncJobRepo.findLatestJobBySource as jest.Mock).mockImplementation(
        async (sourceType, sourceId) => {
          if (sourceId === 'ug-1') {
            return { id: 'j1', status: SyncJobStatus.COMPLETED } as unknown as AuthorizationSyncJob;
          }
          if (sourceId === 'ug-2') {
            return null; // pending
          }
          if (sourceId === 'role-1') {
            return { id: 'j3', status: SyncJobStatus.COMPLETED } as unknown as AuthorizationSyncJob;
          }
          if (sourceId === 'role-2') {
            return {
              id: 'j4',
              status: SyncJobStatus.FAILED,
              errorDetails: { message: 'err' },
            } as unknown as AuthorizationSyncJob;
          }
          return null;
        },
      );

      const summary = await service.getTenantSummary();

      expect(summary.tenantCode).toBe(tenantCode);
      expect(summary.totalEntities).toBe(4);
      expect(summary.completed).toBe(2);
      expect(summary.pending).toBe(1);
      expect(summary.processing).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.evaluatedAt).toBeDefined();
    });
  });
});
