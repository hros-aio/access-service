import { ConflictException, Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { AuthenticationSettings } from '../entities/authentication-settings.entity';

@Injectable()
export class AuthenticationSettingsRepository {
  constructor(private readonly transactionService: TransactionService) {}

  protected get repository(): Repository<AuthenticationSettings> {
    return this.transactionService.getManager().getRepository(AuthenticationSettings);
  }

  async findByTenantCode(tenantCode: string): Promise<AuthenticationSettings | null> {
    return this.repository.findOne({ where: { tenantCode } });
  }

  async updateWithOptimisticLock(
    tenantCode: string,
    expectedVersion: number,
    updateData: Partial<AuthenticationSettings>,
  ): Promise<AuthenticationSettings> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AuthenticationSettings)
      .set({
        ...updateData,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where('tenant_code = :tenantCode AND version = :expectedVersion', {
        tenantCode,
        expectedVersion,
      })
      .execute();

    if (result.affected === 0) {
      throw new ConflictException(
        `Optimistic lock conflict: Authentication settings for tenant ${tenantCode} were modified concurrently`,
      );
    }

    const updated = await this.findByTenantCode(tenantCode);
    if (!updated) {
      throw new ConflictException(`Tenant settings not found for tenant ${tenantCode}`);
    }

    return updated;
  }
}
