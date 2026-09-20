import { Controller, UseFilters } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope, EventPublishException } from '@new-hros/libs-events';

import { EventType } from '@/enums';
import { ProvisioningApplicationService } from '@/modules/provisioning/services/provisioning.application.service';

export interface TenantCreatedPayload {
  tenantCode: string;
  rootAdminEmail: string;
}

@Controller()
@UseFilters(EventPublishException)
export class TenantProvisioningHandler {
  constructor(private readonly provisioningService: ProvisioningApplicationService) {}

  @EventPattern(EventType.TENANT_CREATED)
  async handleTenantLifecycleEvent(
    @Payload() envelope: EventEnvelope<TenantCreatedPayload>,
  ): Promise<unknown> {
    const payload = envelope.payload;

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
      return this.provisioningService.bootstrapRootAdmin(payload);
    });
  }
}
