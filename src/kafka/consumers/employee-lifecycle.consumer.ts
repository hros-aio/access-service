import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';
import { EmployeeLifecyclePayload } from '../interfaces/employee-lifecycle.interface';

@Controller()
export class EmployeeLifecycleConsumer {
  constructor(private readonly provisioningService: ProvisioningApplicationService) {}

  @EventPattern('employee.lifecycle-events')
  async handleEmployeeLifecycleEvent(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload> & { eventType?: string },
  ): Promise<unknown> {
    const eventType =
      envelope.eventType ||
      (envelope as unknown as { payload?: { eventType?: string } }).payload?.eventType;

    if (
      eventType !== EventType.EMPLOYEE_SUSPENDED &&
      eventType !== EventType.EMPLOYEE_TERMINATED &&
      eventType !== EventType.EMPLOYEE_REACTIVATED
    ) {
      return;
    }

    const payload = envelope.payload?.employeeId
      ? envelope.payload
      : (envelope as unknown as { payload?: { payload?: EmployeeLifecyclePayload } }).payload
          ?.payload || envelope.payload;

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
      return this.provisioningService.synchronizeEmployeeStatus(envelope.id, eventType, payload);
    });
  }
}
