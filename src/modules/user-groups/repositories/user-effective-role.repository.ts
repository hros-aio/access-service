import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { In, Repository } from 'typeorm';

import { GenerateUserEffectiveRoleKey } from '../../../constants';
import { UserEffectiveRole } from '../entities/user-effective-role.entity';

export interface UserEffectiveRoleEntry {
  roleId: string;
  sourceGroupId: string;
  scopeType: string;
  scopeEntityId?: string | null;
}

@Injectable()
export class UserEffectiveRoleRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<UserEffectiveRole> {
    return this.transactionService.getManager().getRepository(UserEffectiveRole);
  }

  async findEffectiveRolesByEmployee(
    tenantCode: string,
    employeeId: string,
  ): Promise<UserEffectiveRole[]> {
    return this.repository.find({
      where: { tenantCode, employeeId },
      relations: ['role'],
    });
  }

  async deleteByTenantAndIds(tenantCode: string, ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;

    await this.repository.delete({
      tenantCode,
      id: In(ids),
    });
  }

  async syncEffectiveRolesForEmployee(
    tenantCode: string,
    employeeId: string,
    targetRoles: UserEffectiveRoleEntry[],
  ): Promise<{ inserted: number; deleted: number }> {
    // 1. Fetch current effective roles
    const currentRoles = await this.repository.find({
      where: { tenantCode, employeeId },
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
      await this.deleteByTenantAndIds(tenantCode, toDeleteIds);
    }

    if (toInsert.length > 0) {
      const entities = toInsert.map((item) => ({
        tenantCode,
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

  async deleteBySourceGroup(tenantCode: string, sourceGroupId: string): Promise<void> {
    await this.repository.delete({ tenantCode, sourceGroupId });
  }
}
