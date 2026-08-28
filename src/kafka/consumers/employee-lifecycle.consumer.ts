import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { EmployeeReferenceRepository } from '../../modules/employee/repositories/employee-reference.repository';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';
import { EmployeeAttributePropagationService } from '../../modules/user-groups/services/employee-attribute-propagation.service';
import { EmployeeLifecyclePayload } from '../interfaces/employee-lifecycle.interface';

@Controller()
export class EmployeeLifecycleConsumer {
  private readonly logger = new Logger(EmployeeLifecycleConsumer.name);

  constructor(
    private readonly provisioningService: ProvisioningApplicationService,
    private readonly employeeRepo: EmployeeReferenceRepository,
    private readonly propagationService: EmployeeAttributePropagationService,
  ) {}

  @EventPattern('employee.lifecycle-events')
  async handleEmployeeLifecycleEvent(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload> & { eventType?: string },
  ): Promise<unknown> {
    const eventType =
      envelope.eventType ||
      (envelope as unknown as { payload?: { eventType?: string } }).payload?.eventType;

    const payload = envelope.payload?.employeeId
      ? envelope.payload
      : (envelope as unknown as { payload?: { payload?: EmployeeLifecyclePayload } }).payload
          ?.payload || envelope.payload;

    if (!payload || !payload.tenantCode || !payload.employeeId) {
      return;
    }

    const context: RequestContext = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      serviceName: 'hrms-access-service',
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      // 1. Handle status sync if suspended/terminated/reactivated
      if (
        eventType === EventType.EMPLOYEE_SUSPENDED ||
        eventType === EventType.EMPLOYEE_TERMINATED ||
        eventType === EventType.EMPLOYEE_REACTIVATED
      ) {
        await this.provisioningService.synchronizeEmployeeStatus(envelope.id, eventType, payload);
      }

      // 2. Handle reporting line changes
      if (eventType === 'employee.reporting-line-changed') {
        const { tenantCode, oldManagerEmployeeId, newManagerEmployeeId } = payload;
        if (oldManagerEmployeeId) {
          await this.employeeRepo.updateReporteesCount(tenantCode, oldManagerEmployeeId, -1);
          await this.propagationService.handleEmployeeAttributeChange(
            tenantCode,
            oldManagerEmployeeId,
            ['reporteesCount', 'hasReportees'],
          );
        }
        if (newManagerEmployeeId) {
          await this.employeeRepo.updateReporteesCount(tenantCode, newManagerEmployeeId, 1);
          await this.propagationService.handleEmployeeAttributeChange(
            tenantCode,
            newManagerEmployeeId,
            ['reporteesCount', 'hasReportees'],
          );
        }
      }

      // 3. Handle projection updates for attribute changes
      const updated = await this.employeeRepo.upsertProjection({
        employeeId: payload.employeeId,
        tenantCode: payload.tenantCode,
        employeeCode: payload.employeeCode || payload.employeeId,
        companyId: payload.companyId,
        locationId: payload.locationId,
        departmentId: payload.departmentId,
        gradeId: payload.gradeId,
        jobTitleId: payload.jobTitleId,
        employmentStatus: payload.employmentStatus || payload.status || 'ACTIVE',
        status: payload.status || 'ACTIVE',
        managerEmployeeId: payload.newManagerEmployeeId || payload.managerEmployeeId,
        sourceVersion: payload.sourceVersion || 0,
      });

      if (updated) {
        const changedKeys: string[] = [];
        if (payload.departmentId) changedKeys.push('departmentId');
        if (payload.locationId) changedKeys.push('locationId');
        if (payload.companyId) changedKeys.push('companyId');
        if (payload.gradeId) changedKeys.push('gradeId');
        if (payload.jobTitleId) changedKeys.push('jobTitleId');
        if (payload.employmentStatus || payload.status) changedKeys.push('employmentStatus');

        if (changedKeys.length > 0) {
          await this.propagationService.handleEmployeeAttributeChange(
            payload.tenantCode,
            payload.employeeId,
            changedKeys,
          );
        }
      }
    });
  }
}
