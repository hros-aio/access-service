import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../entities/auth-security-event-outbox.entity';

@Injectable()
export class AuthSecurityEventOutboxRepository extends BaseRepository<AuthSecurityEventOutbox> {
  constructor(transactionService: TransactionService) {
    super(AuthSecurityEventOutbox, transactionService);
  }

  async findPendingEvents(): Promise<AuthSecurityEventOutbox[]> {
    return this.find({ publishStatus: 'pending' });
  }

  async findByUserId(userId: string): Promise<AuthSecurityEventOutbox[]> {
    return this.find({ userId });
  }
}
