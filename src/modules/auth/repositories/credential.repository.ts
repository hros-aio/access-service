import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { Credential } from '../entities/credential.entity';

@Injectable()
export class CredentialRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<Credential> {
    return this.transactionService.getManager().getRepository(Credential);
  }

  async save(credential: Credential): Promise<Credential> {
    return this.repository.save(credential);
  }

  async findById(id: string): Promise<Credential | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findOne(options: import('typeorm').FindOneOptions<Credential>): Promise<Credential | null> {
    return this.repository.findOne(options);
  }

  async findActiveByUserId(userId: string): Promise<Credential | null> {
    return this.repository.findOne({ where: { userId, status: 'active' } });
  }

  async findByUserId(userId: string): Promise<Credential[]> {
    return this.repository.find({ where: { userId } });
  }
}
