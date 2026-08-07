import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository, DeepPartial, FindOptionsWhere } from 'typeorm';

import { AuthSecurityEventOutbox } from '../entities/auth-security-event-outbox.entity';

@Injectable()
export class AuthSecurityEventOutboxRepository {
  constructor(private readonly transactionService: TransactionService) {}

  protected get repository(): Repository<AuthSecurityEventOutbox> {
    return this.transactionService.getManager().getRepository(AuthSecurityEventOutbox);
  }

  async create(entityData: DeepPartial<AuthSecurityEventOutbox>): Promise<AuthSecurityEventOutbox> {
    const entity = this.repository.create(entityData);
    return this.repository.save(entity);
  }

  async save(entity: AuthSecurityEventOutbox): Promise<AuthSecurityEventOutbox> {
    return this.repository.save(entity);
  }

  async find(where: FindOptionsWhere<AuthSecurityEventOutbox>): Promise<AuthSecurityEventOutbox[]> {
    return this.repository.find({ where });
  }

  async findPendingEvents(): Promise<AuthSecurityEventOutbox[]> {
    return this.find({ publishStatus: 'pending' });
  }

  async findPendingForRetry(maxAttempts = 5): Promise<AuthSecurityEventOutbox[]> {
    return this.repository
      .createQueryBuilder('outbox')
      .where("outbox.publish_status = 'pending'")
      .andWhere('outbox.attempt_count < :maxAttempts', { maxAttempts })
      .orderBy('outbox.created_at', 'ASC')
      .getMany();
  }

  async recordAttemptFailure(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(AuthSecurityEventOutbox)
      .set({
        attemptCount: () => 'attempt_count + 1',
        lastAttemptedAt: new Date(),
      })
      .where('id = :id', { id })
      .execute();
  }

  async findByUserId(userId: string): Promise<AuthSecurityEventOutbox[]> {
    const tenantCode = RequestContextService.getTenantCode();
    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }
    return this.find({ tenantCode, userId });
  }

  async clear(): Promise<void> {
    await this.repository.clear();
  }
}
