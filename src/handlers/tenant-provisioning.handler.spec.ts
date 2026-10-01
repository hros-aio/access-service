/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';

import { TenantProvisioningHandler } from './tenant-provisioning.handler';

import { EventType } from '@/enums';
import { ProvisioningApplicationService } from '@/modules/provisioning/services/provisioning.application.service';

describe('TenantProvisioningConsumer', () => {
  let consumer: TenantProvisioningHandler;
  let mockProvisioningService: { bootstrapRootAdmin: jest.Mock };

  beforeEach(async () => {
    mockProvisioningService = {
      bootstrapRootAdmin: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantProvisioningHandler],
      providers: [{ provide: ProvisioningApplicationService, useValue: mockProvisioningService }],
    }).compile();

    consumer = module.get<TenantProvisioningHandler>(TenantProvisioningHandler);
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

    await consumer.handleTenantLifecycleEvent(envelope as any);

    expect(runSpy).toHaveBeenCalled();
    expect(mockProvisioningService.bootstrapRootAdmin).toHaveBeenCalledWith(envelope.payload);
  });
});
