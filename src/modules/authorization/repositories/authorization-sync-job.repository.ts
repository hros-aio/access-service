import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In, LessThan } from 'typeorm';

import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
} from '../entities/authorization-sync-job.entity';

@Injectable()
export class AuthorizationSyncJobRepository extends BaseRepository<AuthorizationSyncJob> {
  constructor(transactionService: TransactionService) {
    super(AuthorizationSyncJob, transactionService);
  }

  async findInFlightJob(
    sourceType: SyncSourceType,
    sourceId: string,
    sourceVersion: number,
  ): Promise<AuthorizationSyncJob | null> {
    return this.findOne({
      sourceType,
      sourceId,
      sourceVersion,
      status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
    });
  }

  async findLatestJobBySource(
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.findOne(
      {
        sourceType,
        sourceId,
      },
      {
        order: {
          createdAt: 'DESC',
        },
      },
    );
  }

  async findLatestCompletedJobBySource(
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.findOne(
      {
        sourceType,
        sourceId,
        status: SyncJobStatus.COMPLETED,
      },
      {
        order: {
          completedAt: 'DESC',
          createdAt: 'DESC',
        },
      },
    );
  }

  async findActiveJobBySource(
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.findOne(
      {
        sourceType,
        sourceId,
        status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
      },
      {
        order: {
          createdAt: 'DESC',
        },
      },
    );
  }

  async claimNextPendingJob(tenantCode: string): Promise<AuthorizationSyncJob | null> {
    const pendingJob = await this.repository
      .createQueryBuilder('job')
      .where('job.tenant_code = :tenantCode', { tenantCode })
      .andWhere('job.status = :status', { status: SyncJobStatus.PENDING })
      .orderBy(
        `CASE job.priority
          WHEN 'URGENT' THEN 1
          ELSE 2
        END`,
        'ASC',
      )
      .addOrderBy('job.created_at', 'ASC')
      .getOne();

    if (!pendingJob) {
      return null;
    }

    await this.repository.update(
      { id: pendingJob.id },
      {
        status: SyncJobStatus.PROCESSING,
        startedAt: new Date(),
      },
    );

    pendingJob.status = SyncJobStatus.PROCESSING;
    pendingJob.startedAt = new Date();
    return pendingJob;
  }

  async updateProgress(id: string, processedUsers: number, totalUsers?: number): Promise<void> {
    const updateData = new AuthorizationSyncJob();
    updateData.processedUsers = processedUsers;
    if (totalUsers !== undefined) {
      updateData.totalUsers = totalUsers;
    }
    await this.update(id, updateData);
  }

  async markCompleted(id: string, processedUsers?: number): Promise<void> {
    const updateData = new AuthorizationSyncJob();
    updateData.status = SyncJobStatus.COMPLETED;
    updateData.completedAt = new Date();
    if (processedUsers !== undefined) {
      updateData.processedUsers = processedUsers;
    }
    await this.update(id, updateData);
  }

  async markFailed(
    id: string,
    errorDetails: Record<string, unknown>,
    processedUsers?: number,
  ): Promise<void> {
    const updateData = new AuthorizationSyncJob();
    updateData.status = SyncJobStatus.FAILED;
    updateData.completedAt = new Date();
    updateData.errorDetails = errorDetails;
    if (processedUsers !== undefined) {
      updateData.processedUsers = processedUsers;
    }
    await this.update(id, updateData);
  }

  async findStuckProcessingJobs(timeoutMinutes = 10): Promise<AuthorizationSyncJob[]> {
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    return this.repository.find({
      where: {
        status: SyncJobStatus.PROCESSING,
        updatedAt: LessThan(cutoffDate),
      },
      order: {
        updatedAt: 'ASC',
      },
    });
  }

  async reclaimStuckJob(id: string, nextRetryCount: number): Promise<void> {
    const updateData = new AuthorizationSyncJob();
    updateData.status = SyncJobStatus.PENDING;
    updateData.retryCount = nextRetryCount;
    updateData.startedAt = null;
    await this.update(id, updateData);
  }
}
