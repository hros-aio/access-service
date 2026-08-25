import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';

import { Role } from '../entities/role.entity';
import { SystemRoleKey } from '../interfaces/system-role-template.interface';

@Injectable()
export class RoleRepository {
  constructor(private readonly transactionService: TransactionService) {}

  protected get repository(): Repository<Role> {
    return this.transactionService.getManager().getRepository(Role);
  }

  async save(role: Role): Promise<Role> {
    return this.repository.save(role);
  }

  async create(data: DeepPartial<Role>): Promise<Role> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findById(id: string, options?: FindOneOptions<Role>): Promise<Role | null> {
    const tenantCode = RequestContextService.getTenantCode();
    return this.repository.findOne({
      where: { id, tenantCode: tenantCode ?? undefined },
      relations: ['permissions'],
      ...options,
    });
  }

  async findByIdAndTenant(
    id: string,
    tenantCode: string,
    options?: FindOneOptions<Role>,
  ): Promise<Role | null> {
    return this.repository.findOne({
      where: { id, tenantCode },
      relations: ['permissions'],
      ...options,
    });
  }

  async findBySystemKey(tenantCode: string, systemRoleKey: SystemRoleKey): Promise<Role | null> {
    return this.repository.findOne({
      where: { tenantCode, systemRoleKey },
      relations: ['permissions'],
    });
  }

  async findByName(name: string, tenantCode?: string): Promise<Role | null> {
    const tenant = tenantCode ?? RequestContextService.getTenantCode();
    return this.repository.findOne({
      where: { name, tenantCode: tenant ?? undefined },
    });
  }

  async findAllByTenant(tenantCode?: string): Promise<Role[]> {
    const tenant = tenantCode ?? RequestContextService.getTenantCode();
    return this.repository.find({
      where: { tenantCode: tenant ?? undefined },
      relations: ['permissions'],
      order: { createdAt: 'ASC' },
    });
  }

  async countAssignedUsers(roleId: string, tenantCode?: string): Promise<number> {
    const tenant = tenantCode ?? RequestContextService.getTenantCode();
    const result = await this.transactionService
      .getManager()
      .query(
        `SELECT COUNT(DISTINCT user_id) as count FROM user_effective_roles WHERE role_id = $1 AND tenant_code = $2`,
        [roleId, tenant],
      )
      .catch(() => [{ count: 0 }]);

    return parseInt(result[0]?.count ?? '0', 10);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
