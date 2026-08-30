import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, Index } from 'typeorm';

import { TableName } from '../../../enums';

export enum SyncSourceType {
  USER_GROUP = 'USER_GROUP',
  ROLE = 'ROLE',
}

export enum SyncTriggerType {
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
  SYSTEM = 'SYSTEM',
}

export enum SyncJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity(TableName.AUTHORIZATION_SYNC_JOBS)
@Index('idx_authz_sync_jobs_poll', ['status', 'createdAt'])
export class AuthorizationSyncJob extends BaseEntity {
  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: SyncSourceType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'source_version', type: 'int' })
  sourceVersion: number;

  @Column({ name: 'trigger_type', type: 'varchar', length: 32, default: SyncTriggerType.MANUAL })
  triggerType: SyncTriggerType;

  @Column({ name: 'status', type: 'varchar', length: 32, default: SyncJobStatus.PENDING })
  status: SyncJobStatus;

  @Column({ name: 'total_users', type: 'int', nullable: true })
  totalUsers?: number | null;

  @Column({ name: 'processed_users', type: 'int', default: 0 })
  processedUsers: number;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails?: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true })
  createdBy?: string | null;
}
