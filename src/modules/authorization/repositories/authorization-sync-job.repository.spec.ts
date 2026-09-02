import { TransactionService } from '@new-hros/libs-sql';
import { In, Repository } from 'typeorm';

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
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    mockTypeormRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      merge: jest.fn().mockImplementation((entity, patch) => {
        const merged = { ...entity };
        for (const key of Object.keys(patch)) {
          if (patch[key] !== undefined) {
            merged[key] = patch[key];
          }
        }
        return merged;
      }),
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
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
        sourceVersion: 2,
        triggerType: SyncTriggerType.MANUAL,
        status: SyncJobStatus.PENDING,
      };

      const createdEntity = {
        ...jobData,
        id: 'job-1',
        tenantCode: '000000',
      } as AuthorizationSyncJob;
      (mockTypeormRepo.create as jest.Mock).mockReturnValue(createdEntity);
      (mockTypeormRepo.save as jest.Mock).mockResolvedValue(createdEntity);

      const result = await repository.create(jobData);

      expect(mockTypeormRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...jobData,
          tenantCode: '000000',
        }),
      );
      expect(mockTypeormRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });
  });

  describe('findById', () => {
    it('should find job by id', async () => {
      const mockJob = { id: 'job-1', tenantCode: '000000' } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findById('job-1');

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'job-1', tenantCode: '000000' },
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('findLatestJobBySource', () => {
    it('should find latest job by source ordered by createdAt DESC', async () => {
      const mockJob = { id: 'job-latest', tenantCode: '000000' } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findLatestJobBySource(SyncSourceType.USER_GROUP, 'ug-1');

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantCode: '000000',
          sourceType: SyncSourceType.USER_GROUP,
          sourceId: 'ug-1',
        },
        order: {
          createdAt: 'DESC',
        },
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('findLatestCompletedJobBySource', () => {
    it('should find latest completed job by source ordered by completedAt DESC, createdAt DESC', async () => {
      const mockJob = {
        id: 'job-completed',
        status: SyncJobStatus.COMPLETED,
        tenantCode: '000000',
      } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findLatestCompletedJobBySource(SyncSourceType.ROLE, 'role-1');

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantCode: '000000',
          sourceType: SyncSourceType.ROLE,
          sourceId: 'role-1',
          status: SyncJobStatus.COMPLETED,
        },
        order: {
          completedAt: 'DESC',
          createdAt: 'DESC',
        },
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('findActiveJobBySource', () => {
    it('should find active PENDING or PROCESSING job by source', async () => {
      const mockJob = {
        id: 'job-active',
        status: SyncJobStatus.PROCESSING,
        tenantCode: '000000',
      } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findActiveJobBySource(SyncSourceType.USER_GROUP, 'ug-1');

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantCode: '000000',
          sourceType: SyncSourceType.USER_GROUP,
          sourceId: 'ug-1',
          status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
        },
        order: {
          createdAt: 'DESC',
        },
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('claimNextPendingJob', () => {
    it('should return null if no pending job found', async () => {
      qb.getOne.mockResolvedValue(null);

      const result = await repository.claimNextPendingJob('TENANT_A');

      expect(mockTypeormRepo.createQueryBuilder).toHaveBeenCalledWith('job');
      expect(qb.where).toHaveBeenCalledWith('job.tenant_code = :tenantCode', {
        tenantCode: 'TENANT_A',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('job.status = :status', {
        status: SyncJobStatus.PENDING,
      });
      expect(result).toBeNull();
    });

    it('should claim and return highest priority pending job', async () => {
      const pendingJob = {
        id: 'job-1',
        tenantCode: 'TENANT_A',
        status: SyncJobStatus.PENDING,
      } as AuthorizationSyncJob;
      qb.getOne.mockResolvedValue(pendingJob);
      (mockTypeormRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await repository.claimNextPendingJob('TENANT_A');

      expect(mockTypeormRepo.createQueryBuilder).toHaveBeenCalledWith('job');
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
      const mockJob = {
        id: 'job-1',
        status: SyncJobStatus.PENDING,
        tenantCode: '000000',
      } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(mockJob);

      const result = await repository.findInFlightJob(SyncSourceType.USER_GROUP, 'ug-1', 2);

      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantCode: '000000',
            sourceType: SyncSourceType.USER_GROUP,
            sourceId: 'ug-1',
            sourceVersion: 2,
            status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
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
      const existingJob = { id: 'job-1', tenantCode: '000000' } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(existingJob);
      (mockTypeormRepo.save as jest.Mock).mockResolvedValue({
        ...existingJob,
        status: SyncJobStatus.COMPLETED,
        processedUsers: 100,
      });

      await repository.markCompleted('job-1', 100);

      expect(mockTypeormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          status: SyncJobStatus.COMPLETED,
          processedUsers: 100,
        }),
      );
    });

    it('should update job status to FAILED with errorDetails', async () => {
      const existingJob = { id: 'job-1', tenantCode: '000000' } as AuthorizationSyncJob;
      (mockTypeormRepo.findOne as jest.Mock).mockResolvedValue(existingJob);
      const errorDetails = { error: 'Rebuild failed' };
      (mockTypeormRepo.save as jest.Mock).mockResolvedValue({
        ...existingJob,
        status: SyncJobStatus.FAILED,
        errorDetails,
        processedUsers: 50,
      });

      await repository.markFailed('job-1', errorDetails, 50);

      expect(mockTypeormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          status: SyncJobStatus.FAILED,
          errorDetails,
          processedUsers: 50,
        }),
      );
    });
  });
});
