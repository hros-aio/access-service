import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { MfaFactorStatus, MfaMethod } from '../entities/mfa-method.entity';

@Injectable()
export class MfaMethodRepository extends BaseRepository<MfaMethod> {
  constructor(transactionService: TransactionService) {
    super(MfaMethod, transactionService);
  }

  async findActiveByUserId(userId: string): Promise<MfaMethod[]> {
    return this.repository.find({ where: { userId, status: MfaFactorStatus.ACTIVE } });
  }

  async findActivePrimary(userId: string): Promise<MfaMethod | null> {
    return this.findOne({ userId, isPrimary: true, status: MfaFactorStatus.ACTIVE });
  }

  async disableAllUserFactors(userId: string): Promise<void> {
    await this.repository.update(
      { userId, tenantCode: this.tenantCode },
      { status: MfaFactorStatus.DISABLED, disabledAt: new Date(), isPrimary: false },
    );
  }
}
