import { Controller, Logger, UseFilters } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope, EventPublishException } from '@new-hros/libs-events';

import { EventType } from '@/enums';
import { ProvisioningApplicationService } from '@/modules/provisioning/services/provisioning.application.service';
import { EmployeeAttributePropagationService } from '@/modules/user-groups/services/employee-attribute-propagation.service';

export interface EmployeeLifecyclePayload {
  id: string;
  tenantCode: string;
  employeeCode: string;
  companyId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  jobTitleId?: string | null;
  employmentStatus?: string;
  status?: string;
  oldManagerEmployeeId?: string | null;
  newManagerEmployeeId?: string | null;
  managerEmployeeId?: string | null;
  sourceVersion: number;
}

@Controller()
@UseFilters(EventPublishException)
export class EmployeeLifecycleHandler {
  private readonly logger = new Logger(EmployeeLifecycleHandler.name);

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
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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

  @EventPattern(EventType.EMPLOYEE_CREATED)
  async handleEmployeeCreated(
    @Payload() envelope: EventEnvelope<EmployeeLifecyclePayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

    if (!payload || !payload.tenantCode || !payload.id) {
      this.logger.error('Payload is missing required fields or empty', payload);
      return;
    }

    const context: RequestContext = {
      traceId: envelope.traceId || envelope.correlationId || envelope.eventId,
      requestId: envelope.eventId,
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
