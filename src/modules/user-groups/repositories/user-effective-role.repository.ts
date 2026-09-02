import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { GenerateUserEffectiveRoleKey } from '../../../constants';
import { UserEffectiveRole } from '../entities/user-effective-role.entity';

export interface UserEffectiveRoleEntry {
  roleId: string;
  sourceGroupId: string;
  scopeType: string;
  scopeEntityId?: string | null;
}

@Injectable()
export class UserEffectiveRoleRepository extends BaseRepository<UserEffectiveRole> {
  constructor(transactionService: TransactionService) {
    super(UserEffectiveRole, transactionService);
  }

  async countActiveHoldersByRoleId(roleId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('uer')
      .select('COUNT(DISTINCT uer.employeeId)', 'count')
      .where('uer.tenantCode = :tenantCode', { tenantCode: this.tenantCode })
      .andWhere('uer.roleId = :roleId', { roleId })
      .getRawOne<{ count: string }>();

    return parseInt(result?.count ?? '0', 10);
  }

  async countActiveHoldersExcludingSourceGroup(
    roleId: string,
    excludedSourceGroupId: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('uer')
      .select('COUNT(DISTINCT uer.employeeId)', 'count')
      .where('uer.tenantCode = :tenantCode', { tenantCode: this.tenantCode })
      .andWhere('uer.roleId = :roleId', { roleId })
      .andWhere('uer.sourceGroupId != :excludedSourceGroupId', { excludedSourceGroupId })
      .getRawOne<{ count: string }>();

    return parseInt(result?.count ?? '0', 10);
  }

  async deleteByTenantAndIds(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;

    await this.repository.delete({
      tenantCode: this.tenantCode,
      id: In(ids),
    });
  }

  async syncEffectiveRolesForEmployee(
    employeeId: string,
    targetRoles: UserEffectiveRoleEntry[],
  ): Promise<{ inserted: number; deleted: number }> {
    // 1. Fetch current effective roles
    const currentRoles = await this.find({
      employeeId,
    });

    const currentMap = new Map(currentRoles.map((r) => [GenerateUserEffectiveRoleKey(r), r]));
    const targetMap = new Map(targetRoles.map((r) => [GenerateUserEffectiveRoleKey(r), r]));

    const toDeleteIds: string[] = [];
    for (const [key, current] of currentMap.entries()) {
      if (!targetMap.has(key)) {
        toDeleteIds.push(current.id);
      }
    }

    const toInsert: UserEffectiveRoleEntry[] = [];
    for (const [key, target] of targetMap.entries()) {
      if (!currentMap.has(key)) {
        toInsert.push(target);
      }
    }

    if (toDeleteIds.length > 0) {
      await this.deleteByTenantAndIds(toDeleteIds);
    }

    if (toInsert.length > 0) {
      const entities = toInsert.map((item) => ({
        tenantCode: this.tenantCode,
        employeeId,
        roleId: item.roleId,
        sourceGroupId: item.sourceGroupId,
        scopeType: item.scopeType,
        scopeEntityId: item.scopeEntityId || null,
      }));

      await this.repository
        .createQueryBuilder()
        .insert()
        .into(UserEffectiveRole)
        .values(entities)
        .orIgnore()
        .execute();
    }

    return {
      inserted: toInsert.length,
      deleted: toDeleteIds.length,
    };
  }

  async deleteBySourceGroup(sourceGroupId: string): Promise<void> {
    await this.repository.delete({ tenantCode: this.tenantCode, sourceGroupId });
  }
}
