import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import {
  ActiveJobDetailDto,
  NextExpectedSyncMethod,
  SyncComputedStatus,
  SyncStatusResponseDto,
} from '../dto/sync-status-response.dto';
import { SyncStatusSummaryResponseDto } from '../dto/sync-status-summary-response.dto';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

@Injectable()
export class SyncStatusProjectionService {
  private readonly logger = new Logger(SyncStatusProjectionService.name);

  constructor(
    private readonly syncJobRepo: AuthorizationSyncJobRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly roleRepo: RoleRepository,
  ) {}

  async getEntitySyncStatus(
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<SyncStatusResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const { sourceVersion, projectionVersion } = await this.validateAndResolveEntityVersions(
      tenantCode,
      sourceType,
      sourceId,
    );

    const latestJob = await this.syncJobRepo.findLatestJobBySource(
      tenantCode,
      sourceType,
      sourceId,
    );
    const latestCompletedJob = await this.syncJobRepo.findLatestCompletedJobBySource(
      tenantCode,
      sourceType,
      sourceId,
    );

    const { status, nextExpectedSyncMethod, activeJob } = this.computeStatus(
      sourceVersion,
      projectionVersion,
      latestJob,
    );

    const lastSuccessfulSyncAt = latestCompletedJob?.completedAt ?? null;
    const affectedUserCount = latestCompletedJob?.processedUsers ?? latestJob?.processedUsers ?? 0;

    return {
      sourceType,
      sourceId,
      status,
      lastSuccessfulSyncAt,
      affectedUserCount,
      nextExpectedSyncMethod,
      activeJob,
    };
  }

  async getTenantSummary(): Promise<SyncStatusSummaryResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();

    const [userGroups, roles] = await Promise.all([
      this.userGroupRepo.findActiveGroups().catch(() => []),
      this.roleRepo.find({}).catch(() => []),
    ]);

    const entities: {
      sourceType: SyncSourceType;
      sourceId: string;
      version: number;
      projectionVersion: number;
    }[] = [
      ...userGroups.map((g) => ({
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: g.id,
        version: g.version,
        projectionVersion: g.projectionVersion ?? 0,
      })),
      ...roles.map((r) => ({
        sourceType: SyncSourceType.ROLE,
        sourceId: r.id,
        version: r.version,
        projectionVersion: r.projectionVersion ?? 0,
      })),
    ];

    let completed = 0;
    let pending = 0;
    let processing = 0;
    let failed = 0;

    for (const entity of entities) {
      const latestJob = await this.syncJobRepo.findLatestJobBySource(
        tenantCode,
        entity.sourceType,
        entity.sourceId,
      );
      const { status } = this.computeStatus(entity.version, entity.projectionVersion, latestJob);

      switch (status) {
        case SyncComputedStatus.COMPLETED:
          completed++;
          break;
        case SyncComputedStatus.PENDING:
          pending++;
          break;
        case SyncComputedStatus.PROCESSING:
          processing++;
          break;
        case SyncComputedStatus.FAILED:
          failed++;
          break;
      }
    }

    return {
      tenantCode,
      totalEntities: entities.length,
      completed,
      pending,
      processing,
      failed,
      evaluatedAt: new Date(),
    };
  }

  private computeStatus(
    sourceVersion: number,
    projectionVersion: number,
    latestJob: AuthorizationSyncJob | null,
  ): {
    status: SyncComputedStatus;
    nextExpectedSyncMethod: NextExpectedSyncMethod;
    activeJob: ActiveJobDetailDto | null;
  } {
    if (latestJob && latestJob.status === SyncJobStatus.PROCESSING) {
      return {
        status: SyncComputedStatus.PROCESSING,
        nextExpectedSyncMethod:
          latestJob.triggerType === SyncTriggerType.MANUAL
            ? NextExpectedSyncMethod.MANUAL_IN_FLIGHT
            : NextExpectedSyncMethod.SCHEDULED_DAILY,
        activeJob: {
          jobId: latestJob.id,
          triggerType: latestJob.triggerType,
          progress: {
            processed: latestJob.processedUsers,
            total: latestJob.totalUsers ?? 0,
          },
          error: null,
          retryable: false,
        },
      };
    }

    if (latestJob && latestJob.status === SyncJobStatus.PENDING) {
      return {
        status: SyncComputedStatus.PENDING,
        nextExpectedSyncMethod:
          latestJob.triggerType === SyncTriggerType.MANUAL
            ? NextExpectedSyncMethod.MANUAL_IN_FLIGHT
            : NextExpectedSyncMethod.SCHEDULED_DAILY,
        activeJob: {
          jobId: latestJob.id,
          triggerType: latestJob.triggerType,
          progress: {
            processed: latestJob.processedUsers,
            total: latestJob.totalUsers ?? 0,
          },
          error: null,
          retryable: false,
        },
      };
    }

    if (
      latestJob &&
      latestJob.status === SyncJobStatus.FAILED &&
      sourceVersion > projectionVersion
    ) {
      const errorObj = latestJob.errorDetails as { message?: string; code?: string } | null;
      return {
        status: SyncComputedStatus.FAILED,
        nextExpectedSyncMethod: NextExpectedSyncMethod.SCHEDULED_DAILY,
        activeJob: {
          jobId: latestJob.id,
          triggerType: latestJob.triggerType,
          progress: {
            processed: latestJob.processedUsers,
            total: latestJob.totalUsers ?? 0,
          },
          error: {
            code: errorObj?.code || 'SYNC_ERROR',
            message: errorObj?.message || 'Synchronization failed',
          },
          retryable: true,
        },
      };
    }

    if (sourceVersion > projectionVersion) {
      return {
        status: SyncComputedStatus.PENDING,
        nextExpectedSyncMethod: NextExpectedSyncMethod.SCHEDULED_DAILY,
        activeJob: null,
      };
    }

    return {
      status: SyncComputedStatus.COMPLETED,
      nextExpectedSyncMethod: NextExpectedSyncMethod.NONE,
      activeJob: null,
    };
  }

  private async validateAndResolveEntityVersions(
    tenantCode: string,
    sourceType: SyncSourceType,
    sourceId: string,
  ): Promise<{ sourceVersion: number; projectionVersion: number }> {
    if (sourceType === SyncSourceType.USER_GROUP) {
      const group = await this.userGroupRepo.findFullyById(sourceId);
      if (!group) {
        throw new NotFoundException(
          `User Group with id ${sourceId} not found in tenant ${tenantCode}`,
        );
      }
      return {
        sourceVersion: group.version,
        projectionVersion: group.projectionVersion ?? 0,
      };
    }

    if (sourceType === SyncSourceType.ROLE) {
      const role = await this.roleRepo.findById(sourceId, { required: true });
      return {
        sourceVersion: role.version,
        projectionVersion: role.projectionVersion ?? 0,
      };
    }

    throw new NotFoundException(`Unsupported source type: ${sourceType}`);
  }
}
