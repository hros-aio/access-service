import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { TenantProvisioningConsumer } from './tenant-provisioning.consumer';
import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';

describe('TenantProvisioningConsumer', () => {
  let consumer: TenantProvisioningConsumer;
  let mockProvisioningService: { bootstrapRootAdmin: jest.Mock };

  beforeEach(async () => {
    mockProvisioningService = {
      bootstrapRootAdmin: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantProvisioningConsumer],
      providers: [{ provide: ProvisioningApplicationService, useValue: mockProvisioningService }],
    }).compile();

    consumer = module.get<TenantProvisioningConsumer>(TenantProvisioningConsumer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should delegate to service if eventType is tenant.created', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-123',
      eventType: EventType.TENANT_CREATED,
      payload: {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'admin@tenant-a.com',
      },
    };

    const runSpy = jest.spyOn(RequestContextService, 'run');

    await consumer.handleTenantLifecycleEvent(envelope);

    expect(runSpy).toHaveBeenCalled();
    expect(mockProvisioningService.bootstrapRootAdmin).toHaveBeenCalledWith(
      'evt-123',
      'tenant.lifecycle-events',
      envelope.payload,
    );
  });

  it('should handle eventType nested in payload and nested payload structure', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-123',
      payload: {
        eventType: EventType.TENANT_CREATED,
        payload: {
          tenantCode: 'TENANT_B',
          rootAdminEmail: 'admin@tenant-b.com',
        },
      },
    };

    await consumer.handleTenantLifecycleEvent(
      envelope as unknown as Parameters<typeof consumer.handleTenantLifecycleEvent>[0],
    );

    expect(mockProvisioningService.bootstrapRootAdmin).toHaveBeenCalledWith(
      'evt-123',
      'tenant.lifecycle-events',
      envelope.payload.payload,
    );
  });

  it('should default to tenant.created and resolve flat payload structure', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-123',
      payload: {
        tenantCode: 'TENANT_C',
        rootAdminEmail: 'admin@tenant-c.com',
      },
    };

    await consumer.handleTenantLifecycleEvent(
      envelope as unknown as Parameters<typeof consumer.handleTenantLifecycleEvent>[0],
    );

    expect(mockProvisioningService.bootstrapRootAdmin).toHaveBeenCalledWith(
      'evt-123',
      'tenant.lifecycle-events',
      envelope.payload,
    );
  });

  it('should ignore event if eventType is not tenant.created', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-123',
      eventType: 'tenant.deleted',
      payload: {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'admin@tenant-a.com',
      },
    };

    await consumer.handleTenantLifecycleEvent(envelope);

    expect(mockProvisioningService.bootstrapRootAdmin).not.toHaveBeenCalled();
  });

  it('should fall back to envelope.payload if tenantCode and nested payload are both missing', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      correlationId: 'corr-123',
      eventType: EventType.TENANT_CREATED,
      payload: {
        rootAdminEmail: 'admin@tenant-a.com',
      },
    };

    await consumer.handleTenantLifecycleEvent(
      envelope as unknown as Parameters<typeof consumer.handleTenantLifecycleEvent>[0],
    );

    expect(mockProvisioningService.bootstrapRootAdmin).toHaveBeenCalledWith(
      'evt-123',
      'tenant.lifecycle-events',
      envelope.payload,
    );
  });

  it('should fall back to envelope.id if correlationId is missing', async () => {
    const envelope = {
      id: 'evt-123',
      topic: 'tenant.lifecycle-events',
      producer: 'tenant-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      eventType: EventType.TENANT_CREATED,
      payload: {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'admin@tenant-a.com',
      },
    };

    const runSpy = jest.spyOn(RequestContextService, 'run');

    await consumer.handleTenantLifecycleEvent(
      envelope as unknown as EventEnvelope<{ tenantCode: string; rootAdminEmail: string }>,
    );

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'evt-123' }),
      expect.any(Function),
    );
  });
});
