import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';

import { AuthorizationSyncController } from './authorization-sync.controller';
import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import {
  NextExpectedSyncMethod,
  SyncComputedStatus,
  SyncStatusResponseDto,
} from '../dto/sync-status-response.dto';
import { SyncStatusSummaryResponseDto } from '../dto/sync-status-summary-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import {
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationGuard } from '../guards/authorization.guard';
import { AuthorizationSyncService } from '../services/authorization-sync.service';
import { ScheduledReconciliationScanner } from '../services/scheduled-reconciliation-scanner.service';
import { SyncStatusProjectionService } from '../services/sync-status-projection.service';

describe('AuthorizationSyncController', () => {
  let controller: AuthorizationSyncController;
  let mockSyncService: Partial<AuthorizationSyncService>;
  let mockScanner: Partial<ScheduledReconciliationScanner>;
  let mockProjectionService: Partial<SyncStatusProjectionService>;

  beforeEach(async () => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TEST_TENANT');

    mockSyncService = {
      requestSyncNow: jest.fn(),
      getJobStatus: jest.fn(),
      retryFailedSync: jest.fn(),
    };

    mockScanner = {
      handleCron: jest.fn(),
    };

    mockProjectionService = {
      getEntitySyncStatus: jest.fn(),
      getTenantSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationSyncController],
      providers: [
        {
          provide: AuthorizationSyncService,
          useValue: mockSyncService,
        },
        {
          provide: ScheduledReconciliationScanner,
          useValue: mockScanner,
        },
        {
          provide: SyncStatusProjectionService,
          useValue: mockProjectionService,
        },
      ],
    })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthorizationSyncController>(AuthorizationSyncController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /authz/sync-now', () => {
    it('should delegate to syncService.requestSyncNow and return DTO', async () => {
      const dto: TriggerSyncNowDto = {
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const responseDto: SyncJobResponseDto = {
        jobId: 'job-123',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: dto.sourceId,
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        totalUsers: null,
        isNoOp: false,
        message: 'Authorization synchronization job queued successfully',
      };

      (mockSyncService.requestSyncNow as jest.Mock).mockResolvedValue(responseDto);

      const result = await controller.triggerSyncNow(dto);

      expect(mockSyncService.requestSyncNow).toHaveBeenCalledWith(dto);
      expect(result).toEqual(responseDto);
    });
  });

  describe('GET /authz/sync-jobs/:jobId', () => {
    it('should delegate to syncService.getJobStatus and return DTO', async () => {
      const responseDto: SyncJobResponseDto = {
        jobId: 'job-123',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PROCESSING,
        processedUsers: 50,
        totalUsers: 100,
        isNoOp: false,
        message: 'Job status retrieved successfully',
      };

      (mockSyncService.getJobStatus as jest.Mock).mockResolvedValue(responseDto);

      const result = await controller.getSyncJobStatus('job-123');

      expect(mockSyncService.getJobStatus).toHaveBeenCalledWith('job-123');
      expect(result).toEqual(responseDto);
    });
  });

  describe('GET /authz/sync-status/summary', () => {
    it('should return tenant-wide synchronization summary', async () => {
      const summaryDto: SyncStatusSummaryResponseDto = {
        tenantCode: 'TEST_TENANT',
        totalEntities: 10,
        completed: 8,
        pending: 1,
        processing: 1,
        failed: 0,
        evaluatedAt: new Date('2026-08-31T20:00:00Z'),
      };

      (mockProjectionService.getTenantSummary as jest.Mock).mockResolvedValue(summaryDto);

      const result = await controller.getSyncStatusSummary();

      expect(mockProjectionService.getTenantSummary).toHaveBeenCalledWith('TEST_TENANT');
      expect(result).toEqual(summaryDto);
    });

    it('should throw error if tenantCode is missing from context', async () => {
      jest
        .spyOn(RequestContextService, 'getTenantCode')
        .mockReturnValue(undefined as unknown as string);

      await expect(controller.getSyncStatusSummary()).rejects.toThrow(
        'Tenant code is missing from active RequestContext',
      );
    });
  });

  describe('GET /authz/sync-status/:sourceType/:sourceId', () => {
    it('should return granular entity sync status', async () => {
      const statusDto: SyncStatusResponseDto = {
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        status: SyncComputedStatus.COMPLETED,
        lastSuccessfulSyncAt: new Date('2026-08-30T12:00:00Z'),
        affectedUserCount: 150,
        nextExpectedSyncMethod: NextExpectedSyncMethod.NONE,
        activeJob: null,
      };

      (mockProjectionService.getEntitySyncStatus as jest.Mock).mockResolvedValue(statusDto);

      const result = await controller.getEntitySyncStatus(SyncSourceType.USER_GROUP, 'ug-1');

      expect(mockProjectionService.getEntitySyncStatus).toHaveBeenCalledWith(
        'TEST_TENANT',
        SyncSourceType.USER_GROUP,
        'ug-1',
      );
      expect(result).toEqual(statusDto);
    });

    it('should throw error if tenantCode is missing from context', async () => {
      jest
        .spyOn(RequestContextService, 'getTenantCode')
        .mockReturnValue(undefined as unknown as string);

      await expect(
        controller.getEntitySyncStatus(SyncSourceType.USER_GROUP, 'ug-1'),
      ).rejects.toThrow('Tenant code is missing from active RequestContext');
    });
  });

  describe('POST /authz/sync-status/:sourceType/:sourceId/retry', () => {
    it('should delegate retry to syncService.retryFailedSync', async () => {
      const responseDto: SyncJobResponseDto = {
        jobId: 'job-retried',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 3,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        totalUsers: null,
        isNoOp: false,
        message: 'Authorization synchronization job queued successfully',
      };

      (mockSyncService.retryFailedSync as jest.Mock).mockResolvedValue(responseDto);

      const result = await controller.retryFailedSync(SyncSourceType.USER_GROUP, 'ug-1');

      expect(mockSyncService.retryFailedSync).toHaveBeenCalledWith(
        SyncSourceType.USER_GROUP,
        'ug-1',
      );
      expect(result).toEqual(responseDto);
    });
  });

  describe('POST /authz/scheduled-sweep', () => {
    it('should trigger scheduled reconciliation scanner sweep and return response', async () => {
      (mockScanner.handleCron as jest.Mock).mockResolvedValue(undefined);

      const result = await controller.triggerScheduledSweep();

      expect(mockScanner.handleCron).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Scheduled authorization reconciliation sweep executed successfully',
      });
    });
  });
});
