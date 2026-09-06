import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { FindOneOptions } from 'typeorm';

import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(transactionService: TransactionService) {
    super(User, transactionService);
  }

  async findByIdUnscoped(id: string): Promise<User> {
    return this.findById(id, { withTenancy: false, required: true });
  }

  async findByIdForUpdateUnscoped(id: string): Promise<User> {
    return this.findById(id, {
      required: true,
      withTenancy: false,
      lock: { mode: 'pessimistic_write' },
    });
  }

  async findByTenantAndExternalIdentity(externalIdentityId: string): Promise<User | null> {
    return this.repository.findOne({
      where: { externalIdentityId },
    });
  }

  async findByEmailUnscoped(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.findOne({ normalizedEmail }, { withTenancy: false });
  }

  async findByEmailWithTenant(email: string, tenantCode: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.findOne({ normalizedEmail, tenantCode });
  }

  async findTenantCodeByEmail(email: string): Promise<string[]> {
    const normalizedEmail = email.toLowerCase().trim();
    const users = await this.find(
      { normalizedEmail },
      {
        withTenancy: false,
        select: { tenantCode: true },
      },
    );
    return users.map((u) => u.tenantCode);
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

  async incrementSecurityVersionById(id: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(this.entityTarget)
      .set({
        securityVersion: () => '"security_version" + 1',
      })
      .where('id = :id', { id })
      .andWhere('tenant_code = :tenantCode', { tenantCode: this.tenantCode })
      .returning(['id'])
      .execute();

    return result.affected ?? 0;
  }
}
