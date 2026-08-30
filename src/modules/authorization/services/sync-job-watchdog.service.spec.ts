import { TransactionService } from '@new-hros/libs-sql';

import { SyncJobWatchdogService } from './sync-job-watchdog.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

describe('SyncJobWatchdogService', () => {
  let watchdog: SyncJobWatchdogService;
  let mockSyncJobRepo: Partial<AuthorizationSyncJobRepository>;
  let mockOutboxRepo: Partial<AuthSecurityEventOutboxRepository>;
  let mockTransactionService: Partial<TransactionService>;

  beforeEach(() => {
    mockSyncJobRepo = {
      findStuckProcessingJobs: jest.fn(),
      reclaimStuckJob: jest.fn(),
      markFailed: jest.fn(),
    };

    mockOutboxRepo = {
      create: jest.fn(),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
    };

    watchdog = new SyncJobWatchdogService(
      mockSyncJobRepo as unknown as AuthorizationSyncJobRepository,
      mockOutboxRepo as unknown as AuthSecurityEventOutboxRepository,
      mockTransactionService as unknown as TransactionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndReclaimStuckJobs', () => {
    it('should do nothing and return 0 if no stuck jobs', async () => {
      (mockSyncJobRepo.findStuckProcessingJobs as jest.Mock).mockResolvedValue([]);

      const recovered = await watchdog.checkAndReclaimStuckJobs();

      expect(recovered).toBe(0);
      expect(mockSyncJobRepo.reclaimStuckJob).not.toHaveBeenCalled();
    });

    it('should reclaim stuck job back to PENDING if retry count within limit', async () => {
      const stuckJob = {
        id: 'job-1',
        retryCount: 1,
        status: SyncJobStatus.PROCESSING,
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.findStuckProcessingJobs as jest.Mock).mockResolvedValue([stuckJob]);

      const recovered = await watchdog.checkAndReclaimStuckJobs();

      expect(recovered).toBe(1);
      expect(mockSyncJobRepo.reclaimStuckJob).toHaveBeenCalledWith('job-1', 2);
      expect(mockSyncJobRepo.markFailed).not.toHaveBeenCalled();
    });

    it('should mark job FAILED and emit outbox event if retry count exceeds limit', async () => {
      const stuckJob = {
        id: 'job-1',
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-1',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        retryCount: 3,
        status: SyncJobStatus.PROCESSING,
        processedUsers: 25,
      } as AuthorizationSyncJob;

      (mockSyncJobRepo.findStuckProcessingJobs as jest.Mock).mockResolvedValue([stuckJob]);

      const recovered = await watchdog.checkAndReclaimStuckJobs();

      expect(recovered).toBe(1);
      expect(mockSyncJobRepo.reclaimStuckJob).not.toHaveBeenCalled();
      expect(mockSyncJobRepo.markFailed).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ code: 'WATCHDOG_TIMEOUT' }),
      );
      expect(mockOutboxRepo.create).toHaveBeenCalled();
    });
  });
});
