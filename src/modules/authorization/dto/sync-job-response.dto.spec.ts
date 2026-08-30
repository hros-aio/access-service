import { SyncJobResponseDto } from './sync-job-response.dto';
import {
  AuthorizationSyncJob,
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';

describe('SyncJobResponseDto', () => {
  it('should format entity properly via fromEntity', () => {
    const job = {
      id: 'job-1',
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 2,
      triggerType: SyncTriggerType.MANUAL,
      status: SyncJobStatus.PENDING,
      processedUsers: 0,
      totalUsers: 10,
      startedAt: new Date('2026-08-30T00:00:00Z'),
      completedAt: null,
      errorDetails: null,
      createdBy: 'user-1',
    } as unknown as AuthorizationSyncJob;

    const dto = SyncJobResponseDto.fromEntity(job, false, 'Queued');
    expect(dto.jobId).toBe('job-1');
    expect(dto.tenantCode).toBe('TENANT_A');
    expect(dto.isNoOp).toBe(false);
    expect(dto.message).toBe('Queued');
  });

  it('should return completed no-op DTO via completedValue', () => {
    const dto = SyncJobResponseDto.completedValue({
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 2,
      triggerType: SyncTriggerType.SCHEDULED,
    });

    expect(dto).toEqual({
      jobId: null,
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 2,
      triggerType: SyncTriggerType.SCHEDULED,
      status: SyncJobStatus.COMPLETED,
      processedUsers: 0,
      totalUsers: 0,
      isNoOp: true,
      message: 'Configuration is already fully synchronized',
    });
  });
});
