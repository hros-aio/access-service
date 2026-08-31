import { ApiProperty } from '@nestjs/swagger';

import { SyncSourceType, SyncTriggerType } from '../entities/authorization-sync-job.entity';

export enum SyncComputedStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum NextExpectedSyncMethod {
  MANUAL_IN_FLIGHT = 'MANUAL_IN_FLIGHT',
  SCHEDULED_DAILY = 'SCHEDULED_DAILY',
  NONE = 'NONE',
}

export class JobProgressDto {
  @ApiProperty({ example: 300 })
  readonly processed: number;

  @ApiProperty({ example: 1420 })
  readonly total: number;
}

export class JobErrorDetailDto {
  @ApiProperty({ example: 'EVALUATION_ERROR' })
  readonly code: string;

  @ApiProperty({ example: 'Criteria evaluation timed out' })
  readonly message: string;
}

export class ActiveJobDetailDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  readonly jobId: string;

  @ApiProperty({ enum: SyncTriggerType, example: SyncTriggerType.MANUAL })
  readonly triggerType: SyncTriggerType;

  @ApiProperty({ type: () => JobProgressDto })
  readonly progress: JobProgressDto;

  @ApiProperty({ type: () => JobErrorDetailDto, nullable: true })
  readonly error?: JobErrorDetailDto | null;

  @ApiProperty({ example: true })
  readonly retryable: boolean;
}

export class SyncStatusResponseDto {
  @ApiProperty({ enum: SyncSourceType, example: SyncSourceType.USER_GROUP })
  readonly sourceType: SyncSourceType;

  @ApiProperty({ example: 'd3b07384-d113-4f7f-8d26-302dfb890f5c' })
  readonly sourceId: string;

  @ApiProperty({ enum: SyncComputedStatus, example: SyncComputedStatus.COMPLETED })
  readonly status: SyncComputedStatus;

  @ApiProperty({ example: '2026-08-30T12:00:00.000Z', nullable: true })
  readonly lastSuccessfulSyncAt?: Date | null;

  @ApiProperty({ example: 1420 })
  readonly affectedUserCount: number;

  @ApiProperty({ enum: NextExpectedSyncMethod, example: NextExpectedSyncMethod.NONE })
  readonly nextExpectedSyncMethod: NextExpectedSyncMethod;

  @ApiProperty({ type: () => ActiveJobDetailDto, nullable: true })
  readonly activeJob?: ActiveJobDetailDto | null;
}
