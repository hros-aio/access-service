import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { AuthorizationSyncJobRepository } from './authorization-sync-job.repository';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';

describe('AuthorizationSyncJobRepository', () => {
  let repository: AuthorizationSyncJobRepository;
  let mockTypeormRepo: Partial<Repository<AuthorizationSyncJob>>;
  let mockTransactionService: Partial<TransactionService>;
  let mockEntityManager: {
    getRepository: jest.Mock;
    query: jest.Mock;
    update: jest.Mock;
  };
  let qb: {
    setLock: jest.Mock;
    setOnLocked: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    mockTypeormRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepo),
      query: jest.fn(),
      update: jest.fn(),
    };

    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    repository = new AuthorizationSyncJobRepository(
      mockTransactionService as unknown as TransactionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and save a sync job entity', async () => {
      const jobData = {
        tenantCode: 'TEST_TENANT',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
      };

      const createdEntity = { ...jobData, id: 'job-1' } as AuthorizationSyncJob;
      (mockTypeormRepo.create as jest.Mock).mockReturnValue(createdEntity);
      (mockTypeormRepo.save as jest.Mock).mockResolvedValue(createdEntity);

      const result = await repository.create(jobData);

      expect(mockTypeormRepo.create).toHaveBeenCalledWith(jobData);
      expect(mockTypeormRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });
  });

  describe('findByIdAndTenant', () => {
    it('should find job by tenantCode and id', async () => {
      const mockJob = { id: 'job-1', tenantCode: 'TENANT_A' } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findByIdAndTenant('TENANT_A', 'job-1');

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
        where: { tenantCode: 'TENANT_A', id: 'job-1' },
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('claimNextPendingJob', () => {
    it('should return null if no pending jobs are available', async () => {
      qb.getOne.mockResolvedValue(null);

      const result = await repository.claimNextPendingJob();

      expect(qb.getOne).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should claim and return job if available', async () => {
      const pendingJob = { id: 'job-1', status: SyncJobStatus.PENDING } as AuthorizationSyncJob;
      qb.getOne.mockResolvedValue(pendingJob);
      (mockTypeormRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await repository.claimNextPendingJob();

      expect(mockTypeormRepo.update).toHaveBeenCalledWith(
        { id: 'job-1' },
        expect.objectContaining({ status: SyncJobStatus.PROCESSING }),
      );
      expect(result?.status).toBe(SyncJobStatus.PROCESSING);
      expect(result?.id).toBe('job-1');
    });
  });

  describe('findInFlightJob', () => {
    it('should find in-flight job using findOne', async () => {
      const mockJob = { id: 'job-1', status: SyncJobStatus.PENDING } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findInFlightJob(
        'TENANT_A',
        SyncSourceType.USER_GROUP,
        'ug-1',
        2,
      );

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantCode: 'TENANT_A',
            sourceType: SyncSourceType.USER_GROUP,
            sourceId: 'ug-1',
            sourceVersion: 2,
          }),
        }),
      );
      expect(result).toEqual(mockJob);
    });
  });

  describe('findStuckProcessingJobs', () => {
    it('should find stuck jobs using find with LessThan cutoff', async () => {
      const stuckJobs = [{ id: 'job-stuck-1' }] as AuthorizationSyncJob[];
      (mockTypeormRepo.find as jest.Mock).mockResolvedValue(stuckJobs);

      const result = await repository.findStuckProcessingJobs(10);

      expect(mockTypeormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SyncJobStatus.PROCESSING,
          }),
          order: { updatedAt: 'ASC' },
        }),
      );
      expect(result).toEqual(stuckJobs);
    });
  });

  describe('markCompleted & markFailed', () => {
    it('should update job status to COMPLETED with completedAt', async () => {
      await repository.markCompleted('job-1', 100);

      expect(mockTypeormRepo.update).toHaveBeenCalledWith(
        { id: 'job-1' },
        expect.objectContaining({
          status: SyncJobStatus.COMPLETED,
          processedUsers: 100,
        }),
      );
    });

    it('should update job status to FAILED with errorDetails', async () => {
      const errorDetails = { error: 'Rebuild failed' };
      await repository.markFailed('job-1', errorDetails, 50);

      expect(mockTypeormRepo.update).toHaveBeenCalledWith(
        { id: 'job-1' },
        expect.objectContaining({
          status: SyncJobStatus.FAILED,
          errorDetails,
          processedUsers: 50,
        }),
      );
    });
  });
});
