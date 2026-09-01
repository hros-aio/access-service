import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import {
  SyncJobPriority,
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
    priority?: SyncJobPriority;
    createdBy?: string | null;
    ignoreValidateSource?: boolean;
  }): Promise<SyncJobResponseDto> {
    const {
      tenantCode,
      sourceType,
      sourceId,
      triggerType = SyncTriggerType.SCHEDULED,
      priority = SyncJobPriority.STANDARD,
      createdBy = 'SYSTEM',
      ignoreValidateSource = false,
    } = params;

    let sourceVersion = params.sourceVersion ?? 1;
    let projectionVersion = 0;

    if (!ignoreValidateSource) {
      const versions = await this.validateAndResolveSourceVersions(
        tenantCode,
        sourceType,
        sourceId,
      );
      sourceVersion = versions.sourceVersion;
      projectionVersion = versions.projectionVersion;
    }

    // 1. Idempotent No-Op check: already synchronized
    if (sourceVersion <= projectionVersion) {
      return SyncJobResponseDto.completedValue({
        tenantCode,
        sourceType,
        sourceId,
        sourceVersion,
        triggerType,
      });
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
        priority,
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
    priority: SyncJobPriority = SyncJobPriority.STANDARD,
  ): Promise<SyncJobResponseDto> {
    return this.transactionService.runInTransaction(async () => {
      const job = await this.syncJobRepo.create({
        tenantCode,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        sourceVersion,
        triggerType,
        priority,
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

  async retryFailedSync(sourceType: SyncSourceType, sourceId: string): Promise<SyncJobResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser()?.userId;

    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }

    const { sourceVersion, projectionVersion } = await this.validateAndResolveSourceVersions(
      tenantCode,
      sourceType,
      sourceId,
    );

    if (sourceVersion <= projectionVersion) {
      throw new BadRequestException('No failed synchronization found for this entity');
    }

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

    return this.enqueueSyncJob({
      tenantCode,
      sourceType,
      sourceId,
      sourceVersion,
      triggerType: SyncTriggerType.MANUAL,
      createdBy: userId ?? 'SYSTEM',
      ignoreValidateSource: true,
    });
  }

  async validateAndResolveSourceVersions(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<{ sourceVersion: number; projectionVersion: number }> {
    if (sourceType === SyncSourceType.USER_GROUP) {
      const group = await this.userGroupRepo.findByTenantAndId(tenantCode, sourceId);
      if (!group) {
        throw new NotFoundException(`User Group with id ${sourceId} not found`);
      }
      return {
        sourceVersion: group.version,
        projectionVersion: group.projectionVersion ?? 0,
      };
    }

    if (sourceType === SyncSourceType.ROLE) {
      const role = await this.roleRepo.findById(sourceId);
      if (!role) {
        throw new NotFoundException(`Role with id ${sourceId} not found`);
      }
      return {
        sourceVersion: role.version,
        projectionVersion: role.projectionVersion ?? 0,
      };
    }

    throw new NotFoundException(`Unsupported source type: ${sourceType}`);
  }
}
