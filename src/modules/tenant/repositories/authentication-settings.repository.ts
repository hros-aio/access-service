import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { AuthenticationSettings } from '../entities/authentication-settings.entity';

@Injectable()
export class AuthenticationSettingsRepository extends BaseRepository<AuthenticationSettings> {
  constructor(transactionService: TransactionService) {
    super(AuthenticationSettings, transactionService);
  }

  async findByTenantCode(tenantCode: string): Promise<AuthenticationSettings | null> {
    return this.repository.findOne({ where: { tenantCode } });
  }

  async updateWithOptimisticLock(
    id: string,
    expectedVersion: number,
    updateData: Partial<AuthenticationSettings>,
  ): Promise<AuthenticationSettings> {
    return this.update(id, {
      ...updateData,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    });
  }
}
