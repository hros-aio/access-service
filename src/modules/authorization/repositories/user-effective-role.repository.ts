import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { UserEffectiveRoleEntity } from '../entities/user-effective-role.entity';
import { ScopeConstraint } from '../interfaces/effective-user-role.interface';

export interface PersistUserEffectiveRoleEntry {
  roleId: string;
  sourceGroupId: string;
  scope: ScopeConstraint;
}

@Injectable()
export class UserEffectiveRoleRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<UserEffectiveRoleEntity> {
    return this.transactionService.getManager().getRepository(UserEffectiveRoleEntity);
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

  async syncUserEffectiveRoles(
    tenantCode: string,
    employeeId: string,
    targetEntries: PersistUserEffectiveRoleEntry[],
  ): Promise<{ inserted: number; deleted: number }> {
    const manager = this.transactionService.getManager();

    const currentRows = await this.repository.find({
      where: { tenantCode, employeeId },
    });

    const createKey = (r: {
      roleId: string;
      sourceGroupId: string;
      scopeType: string;
      scopeEntityId?: string | null;
    }): string => `${r.roleId}_${r.sourceGroupId}_${r.scopeType}_${r.scopeEntityId || 'null'}`;

    const currentMap = new Map(currentRows.map((r) => [createKey(r), r]));

    const targetMap = new Map(
      targetEntries.map((t) => [
        createKey({
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
      await manager.query(
        `
        DELETE FROM user_effective_roles
        WHERE tenant_code = $1 AND id = ANY($2::uuid[]);
        `,
        [tenantCode, toDeleteIds],
      );
    }

    if (toInsert.length > 0) {
      for (const item of toInsert) {
        await manager.query(
          `
          INSERT INTO user_effective_roles (
            id, tenant_code, employee_id, role_id, source_group_id, scope_type, scope_entity_id, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
          ) ON CONFLICT (tenant_code, employee_id, role_id, source_group_id, scope_type, scope_entity_id) DO NOTHING;
          `,
          [
            tenantCode,
            employeeId,
            item.roleId,
            item.sourceGroupId,
            item.scope.type,
            item.scope.refId || null,
          ],
        );
      }
    }

    return {
      inserted: toInsert.length,
      deleted: toDeleteIds.length,
    };
  }
}
