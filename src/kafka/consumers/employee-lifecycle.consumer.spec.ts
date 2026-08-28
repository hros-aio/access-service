import { EmployeeLifecycleConsumer } from './employee-lifecycle.consumer';
import { EmployeeReferenceRepository } from '../../modules/employee/repositories/employee-reference.repository';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';
import { EmployeeAttributePropagationService } from '../../modules/user-groups/services/employee-attribute-propagation.service';

describe('EmployeeLifecycleConsumer', () => {
  let consumer: EmployeeLifecycleConsumer;
  let mockProvisioningService: jest.Mocked<ProvisioningApplicationService>;
  let mockEmployeeRepo: jest.Mocked<EmployeeReferenceRepository>;
  let mockPropagationService: jest.Mocked<EmployeeAttributePropagationService>;

  beforeEach(() => {
    mockProvisioningService = {
      synchronizeEmployeeStatus: jest.fn(),
    } as unknown as jest.Mocked<ProvisioningApplicationService>;
    mockEmployeeRepo = {
      updateReporteesCount: jest.fn(),
      upsertProjection: jest.fn(),
    } as unknown as jest.Mocked<EmployeeReferenceRepository>;
    mockPropagationService = {
      handleEmployeeAttributeChange: jest.fn(),
    } as unknown as jest.Mocked<EmployeeAttributePropagationService>;

    consumer = new EmployeeLifecycleConsumer(
      mockProvisioningService,
      mockEmployeeRepo,
      mockPropagationService,
    );
  });

  it('handles reporting line changed event by updating manager reportee counts and triggering propagation', async () => {
    mockEmployeeRepo.upsertProjection.mockResolvedValueOnce(false);

    await consumer.handleEmployeeLifecycleEvent({
      id: 'event-1',
      topic: 'employee.lifecycle-events',
      producer: 'directory-service',
      timestamp: new Date().toISOString(),
      version: '1.0',
      correlationId: 'corr-1',
      eventType: 'employee.reporting-line-changed',
      payload: {
        tenantCode: 'DEFAULT',
        employeeId: 'emp-1',
        oldManagerEmployeeId: 'mgr-old',
        newManagerEmployeeId: 'mgr-new',
        sourceVersion: 10,
      },
    });

    expect(mockEmployeeRepo.updateReporteesCount).toHaveBeenCalledWith('DEFAULT', 'mgr-old', -1);
    expect(mockEmployeeRepo.updateReporteesCount).toHaveBeenCalledWith('DEFAULT', 'mgr-new', 1);
    expect(mockPropagationService.handleEmployeeAttributeChange).toHaveBeenCalledWith(
      'DEFAULT',
      'mgr-old',
      ['reporteesCount', 'hasReportees'],
    );
    expect(mockPropagationService.handleEmployeeAttributeChange).toHaveBeenCalledWith(
      'DEFAULT',
      'mgr-new',
      ['reporteesCount', 'hasReportees'],
    );
  });

  it('handles attribute update and triggers propagation for changed attributes', async () => {
    mockEmployeeRepo.upsertProjection.mockResolvedValueOnce(true);

    await consumer.handleEmployeeLifecycleEvent({
      id: 'event-2',
      topic: 'employee.lifecycle-events',
      producer: 'directory-service',
      timestamp: new Date().toISOString(),
      version: '1.0',
      correlationId: 'corr-2',
      eventType: 'employee.department-changed',
      payload: {
        tenantCode: 'DEFAULT',
        employeeId: 'emp-2',
        departmentId: 'dept-finance',
        sourceVersion: 12,
      },
    });

    expect(mockEmployeeRepo.upsertProjection).toHaveBeenCalled();
    expect(mockPropagationService.handleEmployeeAttributeChange).toHaveBeenCalledWith(
      'DEFAULT',
      'emp-2',
      ['departmentId'],
    );
  });
});
