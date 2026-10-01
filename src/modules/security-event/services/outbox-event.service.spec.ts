/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { OutboxStatus } from '@new-hros/libs-sql';

import { OutboxAggregateType, OutboxEventService } from './outbox-event.service';
import { EventType } from '../../../enums';
import { SyncJobPriority } from '../../authorization/entities/authorization-sync-job.entity';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';

describe('OutboxEventService', () => {
  let service: OutboxEventService;
  let mockOutboxRepo: any;

  beforeEach(async () => {
    mockOutboxRepo = {
      create: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboxEventService, { provide: OutboxEventRepository, useValue: mockOutboxRepo }],
    }).compile();

    service = module.get<OutboxEventService>(OutboxEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Role Events', () => {
    const ctx = { tenantCode: 'TENANT_A', userId: 'user-1' };

    it('fromRoleCreated should create outbox event with correct fields', async () => {
      const role: any = { id: 'role-1', name: 'Admin', type: 'CUSTOM', version: 1 };
      await service.fromRoleCreated(ctx, { role, permissionCodes: ['USER_READ'] });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.ROLE,
        aggregateId: 'role-1',
        eventType: EventType.ROLE_CREATED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          roleId: 'role-1',
          roleName: 'Admin',
          permissionCodes: ['USER_READ'],
          actorUserId: 'user-1',
        }),
      });
    });

    it('fromRoleCopied should create outbox event with correct fields', async () => {
      const role: any = { id: 'role-2', name: 'Manager', type: 'CUSTOM', version: 1 };
      await service.fromRoleCopied(ctx, {
        role,
        sourceRoleId: 'role-1',
        permissionCodes: ['USER_READ'],
      });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.ROLE,
        aggregateId: 'role-2',
        eventType: EventType.ROLE_COPIED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          roleId: 'role-2',
          sourceRoleId: 'role-1',
          permissionCodes: ['USER_READ'],
        }),
      });
    });

    it('fromPermissionsUpdated should create outbox event with correct fields', async () => {
      const role: any = { id: 'role-1', name: 'Admin', version: 2 };
      await service.fromPermissionsUpdated(ctx, { role, permissionCodes: ['ROLE_READ'] });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.ROLE,
        aggregateId: 'role-1',
        eventType: EventType.ROLE_PERMISSIONS_UPDATED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          roleId: 'role-1',
          permissionCodes: ['ROLE_READ'],
        }),
      });
    });

    it('fromProtectedCapabilityViolation should create outbox event', async () => {
      const role: any = { id: 'role-1', name: 'SystemAdmin', systemRoleKey: 'SYS_ADMIN' };
      await service.fromProtectedCapabilityViolation(ctx, {
        role,
        omittedProtectedCapabilities: ['SYS_MANAGE'],
      });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.ROLE,
        aggregateId: 'role-1',
        eventType: EventType.ROLE_PROTECTED_CAPABILITY_VIOLATION,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          omittedProtectedCapabilities: ['SYS_MANAGE'],
        }),
      });
    });
  });

  describe('User Group Events', () => {
    const ctx = { tenantCode: 'TENANT_A', userId: 'user-1' };

    it('fromUserGroupCreated should create outbox event with correct fields', async () => {
      const userGroup: any = {
        id: 'ug-1',
        name: 'Engineers',
        scopeType: 'ALL',
        scopeRefId: null,
        status: 'ACTIVE',
        version: 1,
        ruleAttributeKeys: ['department'],
      };
      await service.fromUserGroupCreated(ctx, { userGroup, roleIds: ['role-1'] });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.USER_GROUP,
        aggregateId: 'ug-1',
        eventType: EventType.USER_GROUP_CREATED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          userGroupId: 'ug-1',
          name: 'Engineers',
          roleIds: ['role-1'],
        }),
      });
    });

    it('fromAuthorizationUserGroupUpdated should emit urgent priority when specified', async () => {
      const userGroup: any = { id: 'ug-1', version: 1, ruleAttributeKeys: [] };
      await service.fromAuthorizationUserGroupUpdated(ctx, { userGroup, isUrgent: true });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.USER_GROUP,
        aggregateId: 'ug-1',
        eventType: EventType.AUTHORIZATION_USER_GROUP_UPDATED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          isUrgent: true,
          priority: SyncJobPriority.URGENT,
        }),
      });
    });
  });

  describe('Authorization Sync Events', () => {
    const ctx = { tenantCode: 'TENANT_A', userId: 'user-1' };

    it('fromAuthorizationSyncRequested should create outbox event', async () => {
      await service.fromAuthorizationSyncRequested(ctx, {
        jobId: 'job-1',
        sourceType: 'USER_GROUP',
        sourceId: 'ug-1',
        sourceVersion: 1,
        triggerType: 'MANUAL',
      });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.AUTHZ_SYNC,
        aggregateId: 'job-1',
        eventType: EventType.AUTHORIZATION_SYNC_REQUESTED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          jobId: 'job-1',
          sourceType: 'USER_GROUP',
        }),
      });
    });

    it('fromAuthorizationSyncCompleted should evaluate high impact and long running', async () => {
      await service.fromAuthorizationSyncCompleted(ctx, {
        jobId: 'job-1',
        sourceType: 'ROLE',
        sourceId: 'role-1',
        sourceVersion: 1,
        triggerType: 'MANUAL',
        processedUsers: 600,
        durationMs: 35000,
      });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.AUTHZ_SYNC,
        aggregateId: 'job-1',
        eventType: EventType.AUTHORIZATION_SYNC_COMPLETED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          isHighImpact: true,
          isLongRunning: true,
          requiresEmailNotification: true,
        }),
      });
    });

    it('fromAuthorizationSyncFailed should emit critical failure details', async () => {
      await service.fromAuthorizationSyncFailed(ctx, {
        jobId: 'job-1',
        sourceType: 'ROLE',
        sourceId: 'role-1',
        sourceVersion: 1,
        triggerType: 'MANUAL',
        processedUsers: 10,
        errorCode: 'SYNC_ERROR',
        errorMessage: 'Something broke',
      });

      expect(mockOutboxRepo.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_A',
        aggregateType: OutboxAggregateType.AUTHZ_SYNC,
        aggregateId: 'job-1',
        eventType: EventType.AUTHORIZATION_SYNC_FAILED,
        eventVersion: 1,
        status: OutboxStatus.PENDING,
        payload: expect.objectContaining({
          errorCode: 'SYNC_ERROR',
          errorMessage: 'Something broke',
          urgency: 'CRITICAL',
          requiresEmailNotification: true,
        }),
      });
    });
  });
});
