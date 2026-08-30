import { ApiProperty } from '@nestjs/swagger';

import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';

export class SyncJobResponseDto {
  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', nullable: true })
  readonly jobId: string | null;

  @ApiProperty({ example: 'TENANT_ALPHA' })
  readonly tenantCode: string;

  @ApiProperty({ enum: SyncSourceType, example: SyncSourceType.USER_GROUP })
  readonly sourceType: SyncSourceType;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  readonly sourceId: string;

  @ApiProperty({ example: 3 })
  readonly sourceVersion: number;

  @ApiProperty({ enum: SyncTriggerType, example: SyncTriggerType.MANUAL })
  readonly triggerType: SyncTriggerType;

  @ApiProperty({ enum: SyncJobStatus, example: SyncJobStatus.PENDING })
  readonly status: SyncJobStatus;

  @ApiProperty({ example: 0 })
  readonly processedUsers: number;

  @ApiProperty({ example: 100, nullable: true })
  readonly totalUsers: number | null;

  @ApiProperty({ example: false })
  readonly isNoOp: boolean;

  @ApiProperty({ example: 'Authorization synchronization job queued successfully' })
  readonly message: string;

  @ApiProperty({ example: '2026-08-30T14:45:00.000Z', nullable: true })
  readonly startedAt?: Date | null;

  @ApiProperty({ example: null, nullable: true })
  readonly completedAt?: Date | null;

  @ApiProperty({ example: null, nullable: true })
  readonly errorDetails?: Record<string, unknown> | null;

  @ApiProperty({ example: 'usr_admin_01', nullable: true })
  readonly createdBy?: string | null;

  static fromEntity(job: AuthorizationSyncJob, isNoOp = false, message = ''): SyncJobResponseDto {
    return {
      jobId: job.id,
      tenantCode: job.tenantCode,
      sourceType: job.sourceType,
      sourceId: job.sourceId,
      sourceVersion: job.sourceVersion,
      triggerType: job.triggerType,
      status: job.status,
      processedUsers: job.processedUsers,
      totalUsers: job.totalUsers ?? null,
      isNoOp,
      message,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorDetails: job.errorDetails,
      createdBy: job.createdBy,
    };
  }
}
