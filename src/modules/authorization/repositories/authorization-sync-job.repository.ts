import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { DeepPartial, In, LessThan } from 'typeorm';

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

  async create(data: DeepPartial<AuthorizationSyncJob>): Promise<AuthorizationSyncJob> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findByIdAndTenant(tenantCode: string, id: string): Promise<AuthorizationSyncJob | null> {
    return this.repository.findOne({
      where: { tenantCode, id },
    });
  }

  async findInFlightJob(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
    sourceVersion: number,
  ): Promise<AuthorizationSyncJob | null> {
    return this.repository.findOne({
      where: {
        tenantCode,
        sourceType,
        sourceId,
        sourceVersion,
        status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
      },
    });
  }

  async findLatestJobBySource(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.repository.findOne({
      where: {
        tenantCode,
        sourceType,
        sourceId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findLatestCompletedJobBySource(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.repository.findOne({
      where: {
        tenantCode,
        sourceType,
        sourceId,
        status: SyncJobStatus.COMPLETED,
      },
      order: {
        completedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findActiveJobBySource(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<AuthorizationSyncJob | null> {
    return this.repository.findOne({
      where: {
        tenantCode,
        sourceType,
        sourceId,
        status: In([SyncJobStatus.PENDING, SyncJobStatus.PROCESSING]),
      },
      order: {
        createdAt: 'DESC',
      },
    });
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
    const updateData: Record<string, unknown> = {
      processedUsers,
    };
    if (totalUsers !== undefined) {
      updateData.totalUsers = totalUsers;
    }
    await this.repository.update({ id }, updateData as object);
  }

  async markCompleted(id: string, processedUsers?: number): Promise<void> {
    const updateData: Record<string, unknown> = {
      status: SyncJobStatus.COMPLETED,
      completedAt: new Date(),
    };
    if (processedUsers !== undefined) {
      updateData.processedUsers = processedUsers;
    }
    await this.repository.update({ id }, updateData as object);
  }

  async markFailed(
    id: string,
    errorDetails: Record<string, unknown>,
    processedUsers?: number,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status: SyncJobStatus.FAILED,
      completedAt: new Date(),
      errorDetails,
    };
    if (processedUsers !== undefined) {
      updateData.processedUsers = processedUsers;
    }
    await this.repository.update({ id }, updateData as object);
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
    await this.repository.update(
      { id },
      {
        status: SyncJobStatus.PENDING,
        retryCount: nextRetryCount,
        startedAt: null,
      },
    );
  }
}
