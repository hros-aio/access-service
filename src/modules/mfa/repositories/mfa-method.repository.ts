import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { MfaMethod } from '../entities/mfa-method.entity';

@Injectable()
export class MfaMethodRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<MfaMethod> {
    return this.transactionService.getManager().getRepository(MfaMethod);
  }

  async save(mfaMethod: MfaMethod): Promise<MfaMethod> {
    return this.repository.save(mfaMethod);
  }

  async findById(id: string): Promise<MfaMethod | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findActiveByUserId(userId: string): Promise<MfaMethod[]> {
    return this.repository.find({ where: { userId, status: 'active' } });
  }

  async findPrimaryByUserId(userId: string): Promise<MfaMethod | null> {
    return this.repository.findOne({ where: { userId, isPrimary: true, status: 'active' } });
  }
}
