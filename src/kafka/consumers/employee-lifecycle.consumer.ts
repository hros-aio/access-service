import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';
import { EmployeeAttributePropagationService } from '../../modules/user-groups/services/employee-attribute-propagation.service';
import { EmployeeLifecyclePayload } from '../interfaces/employee-lifecycle.interface';

@Controller()
export class EmployeeLifecycleConsumer {
  private readonly logger = new Logger(EmployeeLifecycleConsumer.name);

  constructor(
    private readonly provisioningService: ProvisioningApplicationService,
    private readonly propagationService: EmployeeAttributePropagationService,
  ) {}

  @EventPattern(EventType.EMPLOYEE_TERMINATED)
  async handleEmployeeTerminated(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      return this.provisioningService.synchronizeEmployeeStatus(
        EventType.EMPLOYEE_TERMINATED,
        payload,
      );
    });
  }

  @EventPattern(EventType.EMPLOYEE_SUSPENDED)
  async handleEmployeeSuspended(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      return this.provisioningService.synchronizeEmployeeStatus(
        EventType.EMPLOYEE_SUSPENDED,
        payload,
      );
    });
  }

  @EventPattern(EventType.EMPLOYEE_REACTIVATED)
  async handleEmployeeReactivated(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      return this.provisioningService.synchronizeEmployeeStatus(
        EventType.EMPLOYEE_REACTIVATED,
        payload,
      );
    });
  }

  @EventPattern(EventType.EMPLOYEE_REPORTING_LINE_CHANGED)
  async handleEmployeeReportingLineChanged(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      const { tenantCode, oldManagerEmployeeId, newManagerEmployeeId } = payload;

      return this.propagationService.handleEmployeeReportingLineChanged(
        tenantCode,
        oldManagerEmployeeId,
        newManagerEmployeeId,
      );
    });
  }

  @EventPattern(EventType.EMPLOYEE_UPDATED)
  async handleEmployeeUpdated(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context: RequestContext = {
      traceId: envelope.correlationId || envelope.id,
      requestId: envelope.id,
      tenantCode: payload.tenantCode,
      clientMetadata: {
        ip: '127.0.0.1',
      },
      requestTimestamp: new Date(),
    };

    return RequestContextService.run(context, async () => {
      await this.propagationService.handleEmployeeUpsert(payload);
    });
  }
}
