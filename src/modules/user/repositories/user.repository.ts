import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(transactionService: TransactionService) {
    super(User, transactionService);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.findOne({ normalizedEmail });
  }

  async findByEmployeeId(employeeRefId: string): Promise<User | null> {
    return this.findOne({ employeeRefId });
  }
}
