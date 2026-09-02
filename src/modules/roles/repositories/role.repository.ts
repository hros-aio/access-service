import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { DeepPartial, In, Raw } from 'typeorm';

import { Role } from '../entities/role.entity';
import { RoleStatus, SystemRoleKey } from '../interfaces/system-role-template.interface';

@Injectable()
export class RoleRepository extends BaseRepository<Role> {
  constructor(transactionService: TransactionService) {
    super(Role, transactionService);
  }

  async save(role: Role): Promise<Role> {
    return this.repository.save(role);
  }

  async create(data: DeepPartial<Role>): Promise<Role> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findBySystemKey(systemRoleKey: SystemRoleKey): Promise<Role | null> {
    return this.findOne({ systemRoleKey }, { relations: ['permissions'] });
  }

  async findActiveBuiltInAdminRoles(): Promise<Role[]> {
    return this.find({
      systemRoleKey: SystemRoleKey.ADMINISTRATOR,
      status: RoleStatus.ACTIVE,
    });
  }

  async findByName(name: string): Promise<Role | null> {
    return this.findOne({ name });
  }

  async countActiveUserReach(roleId: string, tenantCode: string): Promise<number> {
    const result = await this.transactionService
      .getManager()
      .query(
        `SELECT COUNT(DISTINCT user_id) as count FROM user_effective_roles WHERE role_id = $1 AND tenant_code = $2`,
        [roleId, tenantCode],
      )
      .catch(() => [{ count: 0 }]);

    return parseInt(result[0]?.count ?? '0', 10);
  }

  async countAssignedUserGroups(roleId: string, tenantCode: string): Promise<number> {
    const result = await this.transactionService
      .getManager()
      .query(
        `SELECT COUNT(DISTINCT user_group_id) as count FROM user_group_roles WHERE role_id = $1 AND tenant_code = $2`,
        [roleId, tenantCode],
      )
      .catch(() => [{ count: 0 }]);

    return parseInt(result[0]?.count ?? '0', 10);
  }

  async updateProjectionVersion(
    tenantCode: string,
    id: string,
    projectionVersion: number,
  ): Promise<void> {
    await this.repository.update({ tenantCode, id }, { projectionVersion } as DeepPartial<Role>);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async findDirtyRoles(): Promise<{ tenantCode: string; id: string; version: number }[]> {
    const roles = await this.repository.find({
      select: ['tenantCode', 'id', 'version'],
      where: {
        version: Raw((alias) => `${alias} <> COALESCE(projection_version, 0)`),
      },
    });

    return roles.map((r) => ({
      tenantCode: r.tenantCode,
      id: r.id,
      version: r.version,
    }));
  }

  async countAssignedUserGroupAndUser(
    roleId: string,
    tenantCode: string,
  ): Promise<{ assignedUserGroupCount: number; activeUserReachCount: number }> {
    const [assignedUserGroupCount, activeUserReachCount] = await Promise.all([
      this.countAssignedUserGroups(roleId, tenantCode),
      this.countActiveUserReach(roleId, tenantCode),
    ]);

    return { assignedUserGroupCount, activeUserReachCount };
  }

  async findByIds(roleIds: string[]): Promise<Role[]> {
    if (roleIds.length === 0) return [];
    return this.find({
      id: In(roleIds),
    });
  }
}
