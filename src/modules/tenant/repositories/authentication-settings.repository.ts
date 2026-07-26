import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { AuthenticationSettings } from '../entities/authentication-settings.entity';

@Injectable()
export class AuthenticationSettingsRepository extends BaseRepository<AuthenticationSettings> {
  constructor(transactionService: TransactionService) {
    super(AuthenticationSettings, transactionService);
  }

  async findByTenantCode(tenantCode: string): Promise<AuthenticationSettings | null> {
    return this.findOne({ tenantCode });
  }
}
