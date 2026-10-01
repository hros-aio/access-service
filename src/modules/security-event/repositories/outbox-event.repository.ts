import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import {
  BaseRepository,
  OutboxEventEntity,
  OutboxStatus,
  TransactionService,
} from '@new-hros/libs-sql';
import { DeepPartial } from 'typeorm';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export interface LegacyOutboxData {
  userId?: string;
  sanitizedPayload?: Record<string, unknown>;
  publishStatus?: string;
}

@Injectable()
export class OutboxEventRepository extends BaseRepository<OutboxEventEntity> {
  constructor(transactionService: TransactionService) {
    super(OutboxEventEntity, transactionService);
  }

  override async create(
    entityData: DeepPartial<OutboxEventEntity> & LegacyOutboxData,
  ): Promise<OutboxEventEntity> {
    const tenantCode = entityData.tenantCode ?? this.tenantCode;
    const aggregateType = entityData.aggregateType ?? (entityData.userId ? 'USER' : 'UNKNOWN');
    const aggregateId = entityData.aggregateId ?? entityData.userId ?? NIL_UUID;
    const payload = entityData.payload ?? entityData.sanitizedPayload ?? {};
    const status =
      entityData.status ??
      (entityData.publishStatus?.toUpperCase() === 'PENDING'
        ? OutboxStatus.PENDING
        : OutboxStatus.PENDING);
    const eventType = entityData.eventType;
    const eventVersion = entityData.eventVersion ?? 1;

    const entityDataToCreate: DeepPartial<OutboxEventEntity> = {
      tenantCode,
      aggregateType,
      aggregateId,
      payload,
      status,
      eventType,
      eventVersion,
    };
    const entity = this.repository.create(entityDataToCreate);
    return this.repository.save(entity);
  }

  async save(entity: OutboxEventEntity): Promise<OutboxEventEntity> {
    return this.repository.save(entity);
  }

  async findPendingEvents(): Promise<OutboxEventEntity[]> {
    return this.repository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async findPendingForRetry(): Promise<OutboxEventEntity[]> {
    return this.repository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async recordAttemptFailure(_id: string): Promise<void> {
    // Attempt tracking is handled by the outbox relay worker
  }

  async findByUserId(userId: string): Promise<OutboxEventEntity[]> {
    const tenantCode = RequestContextService.getTenantCode();
    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }
    return this.repository.find({
      where: { tenantCode, aggregateId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async clear(): Promise<void> {
    await this.repository.clear();
  }
}

// Alias for backwards compatibility
@Injectable()
export class AuthSecurityEventOutboxRepository extends OutboxEventRepository {}
