import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';

import { EmployeeLifecycleConsumer } from './employee-lifecycle.consumer';
import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';

describe('EmployeeLifecycleConsumer', () => {
  let consumer: EmployeeLifecycleConsumer;
  let mockProvisioningService: { synchronizeEmployeeStatus: jest.Mock };

  beforeEach(async () => {
    mockProvisioningService = {
      synchronizeEmployeeStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeLifecycleConsumer],
      providers: [
        {
          provide: ProvisioningApplicationService,
          useValue: mockProvisioningService,
        },
      ],
    }).compile();

    consumer = module.get<EmployeeLifecycleConsumer>(EmployeeLifecycleConsumer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleEmployeeLifecycleEvent', () => {
    it('should ignore event types that are not employee lifecycle transitions', async () => {
      const envelope = {
        id: 'event-id-1',
        topic: 'employee.lifecycle-events',
        timestamp: new Date(),
        tenantCode: 'T1',
        eventType: 'some.other.event',
        payload: {
          employeeId: 'emp-id',
          tenantCode: 'T1',
          sourceVersion: 10,
        },
      };

      await consumer.handleEmployeeLifecycleEvent(
        envelope as unknown as Parameters<
          EmployeeLifecycleConsumer['handleEmployeeLifecycleEvent']
        >[0],
      );

      expect(mockProvisioningService.synchronizeEmployeeStatus).not.toHaveBeenCalled();
    });

    it('should process employee.suspended event and run within request context', async () => {
      const envelope = {
        id: 'event-id-1',
        topic: 'employee.lifecycle-events',
        timestamp: new Date(),
        tenantCode: 'T1',
        eventType: EventType.EMPLOYEE_SUSPENDED,
        payload: {
          employeeId: 'emp-id',
          tenantCode: 'T1',
          sourceVersion: 10,
        },
      };

      mockProvisioningService.synchronizeEmployeeStatus.mockResolvedValue({ success: true });

      const runSpy = jest.spyOn(RequestContextService, 'run');

      await consumer.handleEmployeeLifecycleEvent(
        envelope as unknown as Parameters<
          EmployeeLifecycleConsumer['handleEmployeeLifecycleEvent']
        >[0],
      );

      expect(runSpy).toHaveBeenCalled();
      expect(mockProvisioningService.synchronizeEmployeeStatus).toHaveBeenCalledWith(
        'event-id-1',
        EventType.EMPLOYEE_SUSPENDED,
        envelope.payload,
      );
    });

    it('should process employee.terminated event and run within request context', async () => {
      const envelope = {
        id: 'event-id-2',
        topic: 'employee.lifecycle-events',
        timestamp: new Date(),
        tenantCode: 'T1',
        eventType: EventType.EMPLOYEE_TERMINATED,
        payload: {
          employeeId: 'emp-id',
          tenantCode: 'T1',
          sourceVersion: 11,
        },
      };

      mockProvisioningService.synchronizeEmployeeStatus.mockResolvedValue({ success: true });

      const runSpy = jest.spyOn(RequestContextService, 'run');

      await consumer.handleEmployeeLifecycleEvent(
        envelope as unknown as Parameters<
          EmployeeLifecycleConsumer['handleEmployeeLifecycleEvent']
        >[0],
      );

      expect(runSpy).toHaveBeenCalled();
      expect(mockProvisioningService.synchronizeEmployeeStatus).toHaveBeenCalledWith(
        'event-id-2',
        EventType.EMPLOYEE_TERMINATED,
        envelope.payload,
      );
    });

    it('should process employee.reactivated event and run within request context', async () => {
      const envelope = {
        id: 'event-id-3',
        topic: 'employee.lifecycle-events',
        timestamp: new Date(),
        tenantCode: 'T1',
        eventType: EventType.EMPLOYEE_REACTIVATED,
        payload: {
          employeeId: 'emp-id',
          tenantCode: 'T1',
          sourceVersion: 12,
        },
      };

      mockProvisioningService.synchronizeEmployeeStatus.mockResolvedValue({ success: true });

      const runSpy = jest.spyOn(RequestContextService, 'run');

      await consumer.handleEmployeeLifecycleEvent(
        envelope as unknown as Parameters<
          EmployeeLifecycleConsumer['handleEmployeeLifecycleEvent']
        >[0],
      );

      expect(runSpy).toHaveBeenCalled();
      expect(mockProvisioningService.synchronizeEmployeeStatus).toHaveBeenCalledWith(
        'event-id-3',
        EventType.EMPLOYEE_REACTIVATED,
        envelope.payload,
      );
    });
  });
});
