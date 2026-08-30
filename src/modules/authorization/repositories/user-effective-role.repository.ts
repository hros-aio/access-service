import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { GenerateUserEffectiveRoleKey } from '../../../constants';
import { UserEffectiveRoleEntity } from '../entities/user-effective-role.entity';
import { ScopeConstraint } from '../interfaces/effective-user-role.interface';

export interface PersistUserEffectiveRoleEntry {
  roleId: string;
  sourceGroupId: string;
  scope: ScopeConstraint;
}

@Injectable()
export class UserEffectiveRoleRepository extends BaseRepository<UserEffectiveRoleEntity> {
  constructor(transactionService: TransactionService) {
    super(UserEffectiveRoleEntity, transactionService);
  }

  async findByEmployee(tenantCode: string, employeeId: string): Promise<UserEffectiveRoleEntity[]> {
    return this.repository.find({
      where: { tenantCode, employeeId },
    });
  }

  async deleteByEmployee(tenantCode: string, employeeId: string): Promise<number> {
    const result = await this.repository.delete({ tenantCode, employeeId });
    return result.affected || 0;
  }

  async deleteByTenantAndIds(tenantCode: string, ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;

    await this.repository.delete({
      tenantCode,
      id: In(ids),
    });
  }

  async syncUserEffectiveRoles(
    tenantCode: string,
    employeeId: string,
    targetEntries: PersistUserEffectiveRoleEntry[],
  ): Promise<{ inserted: number; deleted: number }> {
    const currentRows = await this.repository.find({
      where: { tenantCode, employeeId },
    });

    const currentMap = new Map(currentRows.map((r) => [GenerateUserEffectiveRoleKey(r), r]));

    const targetMap = new Map(
      targetEntries.map((t) => [
        GenerateUserEffectiveRoleKey({
          roleId: t.roleId,
          sourceGroupId: t.sourceGroupId,
          scopeType: t.scope.type,
          scopeEntityId: t.scope.refId,
        }),
        t,
      ]),
    );

    const toDeleteIds: string[] = [];
    for (const [key, current] of currentMap.entries()) {
      if (!targetMap.has(key)) {
        toDeleteIds.push(current.id);
      }
    }

    const toInsert: PersistUserEffectiveRoleEntry[] = [];
    for (const [key, target] of targetMap.entries()) {
      if (!currentMap.has(key)) {
        toInsert.push(target);
      }
    }

    if (toDeleteIds.length > 0) {
      await this.deleteByTenantAndIds(tenantCode, toDeleteIds);
    }

    if (toInsert.length > 0) {
      const entities = toInsert.map((item) => ({
        tenantCode,
        employeeId,
        roleId: item.roleId,
        sourceGroupId: item.sourceGroupId,
        scopeType: item.scope.type,
        scopeEntityId: item.scope.refId || null,
      }));

      await this.repository
        .createQueryBuilder()
        .insert()
        .into(UserEffectiveRoleEntity)
        .values(entities)
        .orIgnore()
        .execute();
    }

    return {
      inserted: toInsert.length,
      deleted: toDeleteIds.length,
    };
  }
}
