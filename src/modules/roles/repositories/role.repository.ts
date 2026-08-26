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

  async countAssignedUsers(roleId: string, tenantCode?: string): Promise<number> {
    return this.countActiveUserReach(roleId, tenantCode);
  }

  async countActiveUserReach(roleId: string, tenantCode?: string): Promise<number> {
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

  async countAssignedUserGroups(roleId: string, tenantCode?: string): Promise<number> {
    const tenant = tenantCode ?? RequestContextService.getTenantCode();
    const result = await this.transactionService
      .getManager()
      .query(
        `SELECT COUNT(DISTINCT user_group_id) as count FROM user_group_roles WHERE role_id = $1 AND tenant_code = $2`,
        [roleId, tenant],
      )
      .catch(() => [{ count: 0 }]);

    return parseInt(result[0]?.count ?? '0', 10);
  }

  async findAllByTenant(
    tenantCode?: string,
    filters?: { type?: string; status?: string },
  ): Promise<Role[]> {
    const tenant = tenantCode ?? RequestContextService.getTenantCode();
    const query = this.repository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .where('role.tenantCode = :tenantCode', { tenantCode: tenant });

    if (filters?.type) {
      query.andWhere('role.type = :type', { type: filters.type });
    }
    if (filters?.status) {
      query.andWhere('role.status = :status', { status: filters.status });
    }

    query.orderBy('role.createdAt', 'ASC');
    return query.getMany();
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
