import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RequestContext, RequestContextService } from '@new-hros/libs-core';
import { EventEnvelope } from '@new-hros/libs-events';

import { EventType } from '../../enums';
import { AuthorizationReconciliationWorker } from '../../modules/authorization/services/authorization-reconciliation-worker.service';

export interface AuthorizationSyncRequestedPayload {
  jobId: string;
  tenantCode: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  triggerType: string;
  initiatedBy?: string;
  timestamp?: string;
}

@Controller()
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
