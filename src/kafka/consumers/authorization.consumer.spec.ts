import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';

import { AuthorizationConsumer } from './authorization.consumer';
import { EventType } from '../../enums';
import { AuthorizationReconciliationWorker } from '../../modules/authorization/services/authorization-reconciliation-worker.service';

describe('AuthorizationConsumer', () => {
  let consumer: AuthorizationConsumer;
  let mockReconciliationWorker: { processNextJob: jest.Mock };

  beforeEach(async () => {
    mockReconciliationWorker = {
      processNextJob: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationConsumer],
      providers: [
        {
          provide: AuthorizationReconciliationWorker,
          useValue: mockReconciliationWorker,
        },
      ],
    }).compile();

    consumer = module.get<AuthorizationConsumer>(AuthorizationConsumer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should delegate to reconciliationWorker.processNextJob when event is authorization.sync-requested', async () => {
    const envelope = {
      id: 'evt-sync-1',
      topic: 'authorization.sync-requested',
      producer: 'auth-svc',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-sync-1',
      eventType: EventType.AUTHORIZATION_SYNC_REQUESTED,
      payload: {
        jobId: 'job-123',
        tenantCode: 'TEST_TENANT',
        sourceType: 'USER_GROUP',
        sourceId: 'ug-1',
        sourceVersion: 2,
        triggerType: 'MANUAL',
      },
    };

    const runSpy = jest.spyOn(RequestContextService, 'run');

    await consumer.handleAuthorizationSyncRequested(envelope);

    expect(runSpy).toHaveBeenCalled();
    expect(mockReconciliationWorker.processNextJob).toHaveBeenCalledWith('TEST_TENANT');
  });

  it('should handle payload with eventType wrapped inside envelope.payload', async () => {
    const envelope = {
      id: 'evt-sync-2',
      topic: 'authorization.sync-requested',
      producer: 'auth-svc',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-sync-2',
      payload: {
        eventType: EventType.AUTHORIZATION_SYNC_REQUESTED,
        payload: {
          jobId: 'job-456',
          tenantCode: 'TEST_TENANT_2',
          sourceType: 'ROLE',
          sourceId: 'role-1',
          sourceVersion: 1,
          triggerType: 'MANUAL',
        },
      },
    };

    await consumer.handleAuthorizationSyncRequested(
      envelope as unknown as Parameters<typeof consumer.handleAuthorizationSyncRequested>[0],
    );

    expect(mockReconciliationWorker.processNextJob).toHaveBeenCalledWith('TEST_TENANT_2');
  });

  it('should ignore event if eventType is not authorization.sync-requested', async () => {
    const envelope = {
      id: 'evt-other',
      topic: 'authorization.sync-requested',
      producer: 'auth-svc',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-other',
      eventType: 'other.event',
      payload: {
        jobId: 'job-789',
        tenantCode: 'TEST_TENANT',
        sourceType: 'ROLE',
        sourceId: 'role-2',
        sourceVersion: 1,
        triggerType: 'MANUAL',
      },
    };

    await consumer.handleAuthorizationSyncRequested(envelope);

    expect(mockReconciliationWorker.processNextJob).not.toHaveBeenCalled();
  });

  it('should skip execution if tenantCode is missing', async () => {
    const envelope = {
      id: 'evt-no-tenant',
      topic: 'authorization.sync-requested',
      producer: 'auth-svc',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-no-tenant',
      eventType: EventType.AUTHORIZATION_SYNC_REQUESTED,
      payload: {
        jobId: 'job-999',
        tenantCode: '',
        sourceType: 'ROLE',
        sourceId: 'role-3',
        sourceVersion: 1,
        triggerType: 'MANUAL',
      },
    };

    await consumer.handleAuthorizationSyncRequested(envelope);

    expect(mockReconciliationWorker.processNextJob).not.toHaveBeenCalled();
  });
});
