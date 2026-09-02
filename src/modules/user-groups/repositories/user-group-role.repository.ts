import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { UserGroupRole } from '../entities/user-group-role.entity';

@Injectable()
export class UserGroupRoleRepository extends BaseRepository<UserGroupRole> {
  constructor(transactionService: TransactionService) {
    super(UserGroupRole, transactionService);
  }

  async findRoleIdsByGroupId(userGroupId: string): Promise<string[]> {
    return this.find(
      {
        userGroupId,
      },
      { onlyIds: true },
    );
  }

  async findByGroup(userGroupId: string): Promise<UserGroupRole[]> {
    return this.find(
      {
        userGroupId,
      },
      {
        relations: ['role'],
      },
    );
  }

  async batchDelete(userGroupId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;

    await this.repository.delete({
      tenantCode: this.tenantCode,
      userGroupId,
      roleId: In(roleIds),
    });
  }

  async bulkSave(roles: UserGroupRole[]): Promise<UserGroupRole[]> {
    return this.repository.save(roles);
  }
}
