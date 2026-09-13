import { Controller, Logger, UseFilters } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope, EventPublishException } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { AuthorizationReconciliationWorker } from '../../modules/authorization/services/authorization-reconciliation-worker.service';
import { AuthorizationSyncRequestedPayload } from '../interfaces/authorization-sync-requested.interface';

@Controller()
@UseFilters(EventPublishException)
export class AuthorizationConsumer {
  private readonly logger = new Logger(AuthorizationConsumer.name);

  constructor(private readonly reconciliationWorker: AuthorizationReconciliationWorker) {}

  @EventPattern(EventType.AUTHORIZATION_SYNC_REQUESTED)
  async handleAuthorizationSyncRequested(
    @Payload()
    envelope: EventEnvelope<AuthorizationSyncRequestedPayload>,
  ): Promise<void> {
    const payload = envelope.payload;

    if (!payload?.tenantCode) {
      this.logger.warn(
        `Received ${EventType.AUTHORIZATION_SYNC_REQUESTED} without tenantCode, skipping`,
      );
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
      this.logger.log(
        `Processing authorization sync requested event for tenant ${payload.tenantCode}, job ${payload.jobId || 'N/A'}`,
      );
      await this.reconciliationWorker.processNextJob(payload.tenantCode);
    });
  }
}
