import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';

interface TenantCreatedPayload {
  tenantCode: string;
  rootAdminEmail: string;
}

@Controller()
export class TenantProvisioningConsumer {
  constructor(private readonly provisioningService: ProvisioningApplicationService) {}

  @EventPattern('tenant.lifecycle-events')
  async handleTenantLifecycleEvent(
    @Payload() envelope: EventEnvelope<TenantCreatedPayload> & { eventType?: string },
  ): Promise<unknown> {
    const eventType =
      envelope.eventType ||
      (envelope as unknown as { payload?: { eventType?: string } }).payload?.eventType ||
      EventType.TENANT_CREATED;

    if (eventType !== EventType.TENANT_CREATED) {
      return;
    }

    const payload = envelope.payload?.tenantCode
      ? envelope.payload
      : (envelope as unknown as { payload?: { payload?: TenantCreatedPayload } }).payload
          ?.payload || envelope.payload;

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
      return this.provisioningService.bootstrapRootAdmin(envelope.id, envelope.topic, payload);
    });
  }
}
