import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { ExternalIdentity } from '../entities/external-identity.entity';

@Injectable()
export class ExternalIdentityRepository extends BaseRepository<ExternalIdentity> {
  constructor(transactionService: TransactionService) {
    super(ExternalIdentity, transactionService);
  }

  async findByProviderSubject(
    provider: string,
    providerSubject: string,
  ): Promise<ExternalIdentity | null> {
    return this.findOne({ provider, providerSubject });
  }

  async findByUserId(userId: string): Promise<ExternalIdentity[]> {
    return this.find({ userId });
  }
}
