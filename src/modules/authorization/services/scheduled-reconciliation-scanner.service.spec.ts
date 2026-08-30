import { Test, TestingModule } from '@nestjs/testing';

import { AuthorizationSyncService } from './authorization-sync.service';
import { ScheduledReconciliationScanner } from './scheduled-reconciliation-scanner.service';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import {
  SyncJobStatus,
  SyncSourceType,
  SyncTriggerType,
} from '../entities/authorization-sync-job.entity';
import { ScheduledReconciliationMetrics } from '../telemetry/scheduled-reconciliation.metrics';

describe('ScheduledReconciliationScanner', () => {
  let scanner: ScheduledReconciliationScanner;
  let mockUserGroupRepo: jest.Mocked<UserGroupRepository>;
  let mockRoleRepo: jest.Mocked<RoleRepository>;
  let mockSyncService: jest.Mocked<AuthorizationSyncService>;
  let metrics: ScheduledReconciliationMetrics;

  beforeEach(async () => {
    mockUserGroupRepo = {
      findDirtyUserGroups: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    mockRoleRepo = {
      findDirtyRoles: jest.fn(),
    } as unknown as jest.Mocked<RoleRepository>;

    mockSyncService = {
      enqueueSyncJob: jest.fn(),
    } as unknown as jest.Mocked<AuthorizationSyncService>;

    metrics = new ScheduledReconciliationMetrics();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledReconciliationScanner,
        {
          provide: UserGroupRepository,
          useValue: mockUserGroupRepo,
        },
        {
          provide: RoleRepository,
          useValue: mockRoleRepo,
        },
        {
          provide: AuthorizationSyncService,
          useValue: mockSyncService,
        },
        {
          provide: ScheduledReconciliationMetrics,
          useValue: metrics,
        },
      ],
    }).compile();

    scanner = module.get<ScheduledReconciliationScanner>(ScheduledReconciliationScanner);
  });

  it('should discover dirty user groups and roles across tenants, and enqueue jobs', async () => {
    mockUserGroupRepo.findDirtyUserGroups.mockResolvedValueOnce([
      { tenantCode: 'TENANT_A', id: 'ug-1', version: 3 },
      { tenantCode: 'TENANT_B', id: 'ug-2', version: 2 },
    ]);

    mockRoleRepo.findDirtyRoles.mockResolvedValueOnce([
      { tenantCode: 'TENANT_A', id: 'role-1', version: 4 },
    ]);

    mockSyncService.enqueueSyncJob.mockResolvedValue({
      jobId: 'job-123',
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 3,
      triggerType: SyncTriggerType.SCHEDULED,
      status: SyncJobStatus.PENDING,
      processedUsers: 0,
      totalUsers: 0,
      isNoOp: false,
    } as SyncJobResponseDto);

    const result = await scanner.handleCron();

    expect(result.lockAcquired).toBe(true);
    expect(result.tenantsScanned).toBe(2);
    expect(result.dirtyGroupsFound).toBe(2);
    expect(result.dirtyRolesFound).toBe(1);
    expect(result.jobsEnqueued).toBe(3);

    expect(mockSyncService.enqueueSyncJob).toHaveBeenCalledWith({
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 3,
      triggerType: SyncTriggerType.SCHEDULED,
      createdBy: 'SYSTEM',
      ignoreValidateSource: true,
    });

    expect(mockSyncService.enqueueSyncJob).toHaveBeenCalledWith({
      tenantCode: 'TENANT_A',
      sourceType: SyncSourceType.ROLE,
      sourceId: 'role-1',
      sourceVersion: 4,
      triggerType: SyncTriggerType.SCHEDULED,
      createdBy: 'SYSTEM',
      ignoreValidateSource: true,
    });
  });

  it('should isolate errors per entity and continue enqueuing other entities', async () => {
    mockUserGroupRepo.findDirtyUserGroups.mockResolvedValueOnce([
      { tenantCode: 'TENANT_A', id: 'ug-failing', version: 3 },
      { tenantCode: 'TENANT_B', id: 'ug-success', version: 2 },
    ]);
    mockRoleRepo.findDirtyRoles.mockResolvedValueOnce([]);

    mockSyncService.enqueueSyncJob
      .mockRejectedValueOnce(new Error('Corrupt tenant criteria'))
      .mockResolvedValueOnce({
        jobId: 'job-success',
        tenantCode: 'TENANT_B',
        sourceType: SyncSourceType.USER_GROUP,
        sourceId: 'ug-success',
        sourceVersion: 2,
        triggerType: SyncTriggerType.SCHEDULED,
        status: SyncJobStatus.PENDING,
        processedUsers: 0,
        totalUsers: 0,
        isNoOp: false,
      } as SyncJobResponseDto);

    const result = await scanner.handleCron();

    expect(result.jobsEnqueued).toBe(1);
  });

  it('should process dirty groups and roles via handleByTenant', async () => {
    mockSyncService.enqueueSyncJob.mockResolvedValueOnce({
      jobId: 'job-ug',
      tenantCode: 'TENANT_TEST',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 1,
      triggerType: SyncTriggerType.SCHEDULED,
      status: SyncJobStatus.PENDING,
      processedUsers: 0,
      totalUsers: 0,
      isNoOp: false,
    } as SyncJobResponseDto);

    mockSyncService.enqueueSyncJob.mockResolvedValueOnce({
      jobId: 'job-role',
      tenantCode: 'TENANT_TEST',
      sourceType: SyncSourceType.ROLE,
      sourceId: 'role-1',
      sourceVersion: 1,
      triggerType: SyncTriggerType.SCHEDULED,
      status: SyncJobStatus.PENDING,
      processedUsers: 0,
      totalUsers: 0,
      isNoOp: false,
    } as SyncJobResponseDto);

    const enqueued = await scanner.handleByTenant('TENANT_TEST', {
      groups: [{ id: 'ug-1', version: 1 }],
      roles: [{ id: 'role-1', version: 1 }],
    });

    expect(enqueued).toBe(2);
    expect(mockSyncService.enqueueSyncJob).toHaveBeenCalledWith({
      tenantCode: 'TENANT_TEST',
      sourceType: SyncSourceType.USER_GROUP,
      sourceId: 'ug-1',
      sourceVersion: 1,
      triggerType: SyncTriggerType.SCHEDULED,
      createdBy: 'SYSTEM',
      ignoreValidateSource: true,
    });
    expect(mockSyncService.enqueueSyncJob).toHaveBeenCalledWith({
      tenantCode: 'TENANT_TEST',
      sourceType: SyncSourceType.ROLE,
      sourceId: 'role-1',
      sourceVersion: 1,
      triggerType: SyncTriggerType.SCHEDULED,
      createdBy: 'SYSTEM',
      ignoreValidateSource: true,
    });
  });
});
