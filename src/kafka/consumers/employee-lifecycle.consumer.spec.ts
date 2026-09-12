import { EmployeeLifecycleConsumer } from './employee-lifecycle.consumer';
import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';
import { EmployeeAttributePropagationService } from '../../modules/user-groups/services/employee-attribute-propagation.service';

describe('EmployeeLifecycleConsumer', () => {
  let consumer: EmployeeLifecycleConsumer;
  let mockProvisioningService: jest.Mocked<ProvisioningApplicationService>;
  let mockPropagationService: jest.Mocked<EmployeeAttributePropagationService>;

  beforeEach(() => {
    mockProvisioningService = {
      synchronizeEmployeeStatus: jest.fn(),
    } as unknown as jest.Mocked<ProvisioningApplicationService>;
    mockPropagationService = {
      handleEmployeeReportingLineChanged: jest.fn(),
      handleEmployeeUpsert: jest.fn(),
    } as unknown as jest.Mocked<EmployeeAttributePropagationService>;

    consumer = new EmployeeLifecycleConsumer(mockProvisioningService, mockPropagationService);
  });

  it('handles terminated event by delegating to provisioning service', async () => {
    const envelope = {
      id: 'event-1',
      topic: 'employee.lifecycle-events',
      producer: 'directory-service',
      timestamp: new Date().toISOString(),
      version: '1.0',
      correlationId: 'corr-1',
      eventType: EventType.EMPLOYEE_TERMINATED,
      payload: {
        tenantCode: 'DEFAULT',
        id: 'emp-1',
        employeeCode: 'EMP-001',
        sourceVersion: 10,
      },
    };

    await consumer.handleEmployeeTerminated(envelope);

    expect(mockProvisioningService.synchronizeEmployeeStatus).toHaveBeenCalledWith(
      EventType.EMPLOYEE_TERMINATED,
      envelope.payload,
    );
  });

  it('handles reporting line changed event by delegating to propagation service', async () => {
    const envelope = {
      id: 'event-2',
      topic: 'employee.lifecycle-events',
      producer: 'directory-service',
      timestamp: new Date().toISOString(),
      version: '1.0',
      correlationId: 'corr-2',
      eventType: EventType.EMPLOYEE_REPORTING_LINE_CHANGED,
      payload: {
        tenantCode: 'DEFAULT',
        id: 'emp-1',
        employeeCode: 'EMP-001',
        oldManagerEmployeeId: 'mgr-old',
        newManagerEmployeeId: 'mgr-new',
        sourceVersion: 10,
      },
    };

    await consumer.handleEmployeeReportingLineChanged(envelope);

    expect(mockPropagationService.handleEmployeeReportingLineChanged).toHaveBeenCalledWith(
      'DEFAULT',
      'mgr-old',
      'mgr-new',
    );
  });

  it('handles employee updated event by delegating to propagation service', async () => {
    const envelope = {
      id: 'event-3',
      topic: 'employee.lifecycle-events',
      producer: 'directory-service',
      timestamp: new Date().toISOString(),
      version: '1.0',
      correlationId: 'corr-3',
      eventType: EventType.EMPLOYEE_UPDATED,
      payload: {
        tenantCode: 'DEFAULT',
        id: 'emp-2',
        employeeCode: 'EMP-002',
        departmentId: 'dept-finance',
        sourceVersion: 12,
      },
    };

    await consumer.handleEmployeeUpdated(envelope);

    expect(mockPropagationService.handleEmployeeUpsert).toHaveBeenCalledWith(envelope.payload);
  });
});
