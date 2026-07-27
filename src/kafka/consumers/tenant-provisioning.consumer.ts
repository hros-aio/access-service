import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EventEnvelope } from '@new-hros/libs-events';
import { RequestContextService, RequestContext } from '@new-hros/libs-core';
import { ProvisioningApplicationService } from '../../modules/provisioning/services/provisioning.application.service';

interface TenantCreatedPayload {
  tenantCode: string;
  rootAdminEmail: string;
}

@Controller()
export class TenantProvisioningConsumer {
  constructor(
    private readonly provisioningService: ProvisioningApplicationService,
  ) {}

  @EventPattern('tenant.lifecycle-events')
  async handleTenantLifecycleEvent(
    @Payload() envelope: EventEnvelope<TenantCreatedPayload> & { eventType?: string },
  ): Promise<any> {
    const eventType = envelope.eventType || (envelope as any).payload?.eventType || 'tenant.created';
    
    if (eventType !== 'tenant.created') {
      return;
    }

    const payload = envelope.payload?.tenantCode ? envelope.payload : (envelope as any).payload?.payload || envelope.payload;

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
      return this.provisioningService.bootstrapRootAdmin(
        envelope.id,
        envelope.topic,
        payload,
      );
    });
  }
}
