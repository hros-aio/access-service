import { Test, TestingModule } from '@nestjs/testing';

import { AuthorizationSyncController } from './authorization-sync.controller';
import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import {
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationGuard } from '../guards/authorization.guard';
import { AuthorizationSyncService } from '../services/authorization-sync.service';
import { ScheduledReconciliationScanner } from '../services/scheduled-reconciliation-scanner.service';

describe('AuthorizationSyncController', () => {
  let controller: AuthorizationSyncController;
  let mockSyncService: Partial<AuthorizationSyncService>;
  let mockScanner: Partial<ScheduledReconciliationScanner>;

  beforeEach(async () => {
    mockSyncService = {
      requestSyncNow: jest.fn(),
      getJobStatus: jest.fn(),
    };

    mockScanner = {
      handleCron: jest.fn(),
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

  describe('POST /authz/scheduled-sweep', () => {
    it('should trigger scheduled reconciliation scanner sweep and return response', async () => {
      const sweepSummary = {
        lockAcquired: true,
        tenantsScanned: 3,
        dirtyGroupsFound: 4,
        dirtyRolesFound: 1,
        jobsEnqueued: 5,
        durationMs: 320,
      };

      (mockScanner.handleCron as jest.Mock).mockResolvedValue(sweepSummary);

      const result = await controller.triggerScheduledSweep();

      expect(mockScanner.handleCron).toHaveBeenCalled();
      expect(result).toEqual({
        ...sweepSummary,
        message: 'Scheduled authorization reconciliation sweep executed successfully',
      });
    });
  });
});
