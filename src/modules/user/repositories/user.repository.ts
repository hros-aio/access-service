import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { FindOneOptions } from 'typeorm';

import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(transactionService: TransactionService) {
    super(User, transactionService);
  }

  async findByTenantAndExternalIdentity(
    tenantCode: string,
    externalIdentityId: string,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: { tenantCode, externalIdentityId },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.findOne({ normalizedEmail });
  }

  async findByEmployeeId(employeeRefId: string): Promise<User | null> {
    return this.findOne({ employeeRefId });
  }

  async findOneWithOptions(options: FindOneOptions<User>): Promise<User | null> {
    return this.repository.findOne(options);
  }

  async findByIdWithLock(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  /**
   * Atomically increments security_version for target user in tenant context.
   */
  async bumpSecurityVersion(tenantCode: string, userId: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({
        securityVersion: () => '"security_version" + 1',
      })
      .where('tenant_code = :tenantCode AND id = :userId AND status = :status', {
        tenantCode,
        userId,
        status: 'active',
      })
      .execute();

    return (result.affected || 0) > 0;
  }
}
