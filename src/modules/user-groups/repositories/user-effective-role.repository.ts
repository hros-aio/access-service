import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

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

  async syncEffectiveRolesForEmployee(
    tenantCode: string,
    employeeId: string,
    targetRoles: UserEffectiveRoleEntry[],
  ): Promise<{ inserted: number; deleted: number }> {
    const manager = this.transactionService.getManager();

    // 1. Fetch current effective roles
    const currentRoles = await this.repository.find({
      where: { tenantCode, employeeId },
    });

    const createKey = (r: {
      roleId: string;
      sourceGroupId: string;
      scopeType: string;
      scopeEntityId?: string | null;
    }): string => `${r.roleId}_${r.sourceGroupId}_${r.scopeType}_${r.scopeEntityId || 'null'}`;

    const currentMap = new Map(currentRoles.map((r) => [createKey(r), r]));
    const targetMap = new Map(targetRoles.map((r) => [createKey(r), r]));

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
            item.scopeType,
            item.scopeEntityId || null,
          ],
        );
      }
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
