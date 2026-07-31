import { Injectable } from '@nestjs/common';
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

  async find(where: FindOptionsWhere<AuthSecurityEventOutbox>): Promise<AuthSecurityEventOutbox[]> {
    return this.repository.find({ where });
  }

  async findPendingEvents(): Promise<AuthSecurityEventOutbox[]> {
    return this.find({ publishStatus: 'pending' });
  }

  async findByUserId(userId: string): Promise<AuthSecurityEventOutbox[]> {
    return this.find({ userId });
  }

  async clear(): Promise<void> {
    await this.repository.clear();
  }
}
