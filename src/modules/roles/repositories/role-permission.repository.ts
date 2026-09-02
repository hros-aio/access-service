import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { RolePermission } from '../entities/role-permission.entity';

@Injectable()
export class RolePermissionRepository extends BaseRepository<RolePermission> {
  constructor(transactionService: TransactionService) {
    super(RolePermission, transactionService);
  }

  async bulkSave(rolePermissions: RolePermission[]): Promise<RolePermission[]> {
    if (rolePermissions.length === 0) return [];
    return this.repository.save(rolePermissions);
  }

  async deleteByRoleId(roleId: string): Promise<void> {
    await this.repository.delete({ roleId, isProtected: false, tenantCode: this.tenantCode });
  }
}
