import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import {
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

@Injectable()
export class AuthorizationSyncService {
  private readonly logger = new Logger(AuthorizationSyncService.name);

  constructor(
    private readonly syncJobRepo: AuthorizationSyncJobRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly roleRepo: RoleRepository,
    private readonly outboxRepo: AuthSecurityEventOutboxRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async requestSyncNow(
    dto: TriggerSyncNowDto,
    triggerType: SyncTriggerType = SyncTriggerType.MANUAL,
  ): Promise<SyncJobResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    let userId: string | undefined;
    try {
      userId = RequestContextService.getUser()?.userId;
    } catch {
      userId = undefined;
    }

    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }

    return this.enqueueSyncJob({
      tenantCode,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      triggerType,
      createdBy: userId ?? null,
    });
  }

  /**
   * Enqueues an authorization sync job with dirty check and deduplication.
   * Can be invoked directly by background schedulers in SYSTEM context or by requestSyncNow.
   */
  async enqueueSyncJob(params: {
    tenantCode: string;
    sourceType: SyncSourceType;
    sourceId: string;
    sourceVersion?: number;
    triggerType?: SyncTriggerType;
    createdBy?: string | null;
  }): Promise<SyncJobResponseDto> {
    const {
      tenantCode,
      sourceType,
      sourceId,
      triggerType = SyncTriggerType.SCHEDULED,
      createdBy = 'SYSTEM',
    } = params;

    let sourceVersion = params.sourceVersion ?? 1;
    let projectionVersion = 0;

    if (sourceType === SyncSourceType.USER_GROUP) {
      const group = await this.userGroupRepo.findByTenantAndId(tenantCode, sourceId);
      if (!group) {
        throw new NotFoundException(`User Group with id ${sourceId} not found`);
      }
      sourceVersion = group.version;
      projectionVersion = group.projectionVersion ?? 0;
    } else if (sourceType === SyncSourceType.ROLE) {
      const role = await this.roleRepo.findByIdAndTenant(sourceId, tenantCode);
      if (!role) {
        throw new NotFoundException(`Role with id ${sourceId} not found`);
      }
      sourceVersion = role.version;
      projectionVersion = 'projectionVersion' in role ? Number(role['projectionVersion']) || 0 : 0;
    }

    // 1. Idempotent No-Op check: already synchronized
    if (sourceVersion <= projectionVersion) {
      return {
        jobId: null,
        tenantCode,
        sourceType,
        sourceId,
        sourceVersion,
        triggerType,
        status: SyncJobStatus.COMPLETED,
        processedUsers: 0,
        totalUsers: 0,
        isNoOp: true,
        message: 'Configuration is already fully synchronized',
      };
    }

    // 2. Check for in-flight job
    const inFlightJob = await this.syncJobRepo.findInFlightJob(
      tenantCode,
      sourceType,
      sourceId,
      sourceVersion,
    );

    if (inFlightJob) {
      return SyncJobResponseDto.fromEntity(
        inFlightJob,
        false,
        'Existing synchronization job already in progress',
      );
    }

    // 3. Create new sync job and outbox event inside transaction
    try {
      return await this.createSyncJobTransactional(
        tenantCode,
        createdBy ?? undefined,
        { sourceType, sourceId },
        sourceVersion,
        triggerType,
      );
    } catch (error: unknown) {
      return this.handleInFlightConflict(error, tenantCode, sourceType, sourceId, sourceVersion);
    }
  }

  private async createSyncJobTransactional(
    tenantCode: string,
    userId: string | undefined,
    dto: TriggerSyncNowDto,
    sourceVersion: number,
    triggerType: SyncTriggerType,
  ): Promise<SyncJobResponseDto> {
    return this.transactionService.runInTransaction(async () => {
      const job = await this.syncJobRepo.create({
        tenantCode,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        sourceVersion,
        triggerType,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        createdBy: userId ?? null,
      });

      const outboxEvent = AuthSecurityEventOutbox.fromAuthorizationSyncRequested(
        { tenantCode, userId: userId ?? undefined },
        {
          jobId: job.id,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          sourceVersion,
          triggerType,
          initiatedBy: userId ?? null,
        },
      );

      await this.outboxRepo.create(outboxEvent);

      return SyncJobResponseDto.fromEntity(
        job,
        false,
        'Authorization synchronization job queued successfully',
      );
    });
  }

  private async handleInFlightConflict(
    error: unknown,
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
    sourceVersion: number,
  ): Promise<SyncJobResponseDto> {
    const err = error as { code?: string; message?: string };
    if (err?.code === '23505' || err?.message?.includes('uq_authz_sync_jobs_in_flight')) {
      this.logger.warn(
        `Unique constraint race condition caught for sync job: ${tenantCode}/${sourceType}/${sourceId}/${sourceVersion}`,
      );
      const existingJob = await this.syncJobRepo.findInFlightJob(
        tenantCode,
        sourceType,
        sourceId,
        sourceVersion,
      );
      if (existingJob) {
        return SyncJobResponseDto.fromEntity(
          existingJob,
          false,
          'Existing synchronization job already in progress',
        );
      }
    }
    throw error;
  }

  async getJobStatus(jobId: string): Promise<SyncJobResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }

    const job = await this.syncJobRepo.findByIdAndTenant(tenantCode, jobId);
    if (!job) {
      throw new NotFoundException(`Sync job with id ${jobId} not found`);
    }

    return SyncJobResponseDto.fromEntity(job, false, 'Job status retrieved successfully');
  }
}
