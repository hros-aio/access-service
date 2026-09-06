import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { Credential } from '../entities/credential.entity';

import { CredentialStatus } from '@/enums';

@Injectable()
export class CredentialRepository extends BaseRepository<Credential> {
  constructor(transactionService: TransactionService) {
    super(Credential, transactionService);
  }

  async findActiveByUserForUpdateUnscope(userId: string): Promise<Credential | null> {
    return this.findOne(
      {
        userId,
        status: CredentialStatus.ACTIVE,
      },
      { withTenancy: false, lock: { mode: 'pessimistic_write' } },
    );
  }

  async findActiveByUseUnscope(userId: string): Promise<Credential | null> {
    return this.findOne(
      {
        userId,
        status: CredentialStatus.ACTIVE,
      },
      { withTenancy: false },
    );
  }
}
