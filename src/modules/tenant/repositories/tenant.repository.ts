import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { Tenant } from '../entities/tenant.entity';

@Injectable()
export class TenantRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<Tenant> {
    return this.transactionService.getManager().getRepository(Tenant);
  }

  async save(tenant: Tenant): Promise<Tenant> {
    return this.repository.save(tenant);
  }

  async findByCode(tenantCode: string): Promise<Tenant | null> {
    return this.repository.findOne({ where: { tenantCode } });
  }

  async exists(tenantCode: string): Promise<boolean> {
    const count = await this.repository.count({ where: { tenantCode } });
    return count > 0;
  }
}
