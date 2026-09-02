import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { RolePermission } from '../entities/role-permission.entity';

@Injectable()
export class RolePermissionRepository {
  constructor(private readonly transactionService: TransactionService) {}

  protected get repository(): Repository<RolePermission> {
    return this.transactionService.getManager().getRepository(RolePermission);
  }

  async bulkSave(rolePermissions: RolePermission[]): Promise<RolePermission[]> {
    if (rolePermissions.length === 0) return [];
    return this.repository.save(rolePermissions);
  }

  async findByRoleId(roleId: string): Promise<RolePermission[]> {
    return this.repository.find({
      where: { roleId },
    });
  }

  async deleteByRoleId(roleId: string): Promise<void> {
    await this.repository.delete({ roleId });
  }

  async deleteNonProtectedByRoleId(roleId: string): Promise<void> {
    await this.repository.delete({ roleId, isProtected: false });
  }
}
