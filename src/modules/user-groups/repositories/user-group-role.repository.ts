import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';

import { UserGroupRole } from '../entities/user-group-role.entity';

@Injectable()
export class UserGroupRoleRepository extends BaseRepository<UserGroupRole> {
  constructor(transactionService: TransactionService) {
    super(UserGroupRole, transactionService);
  }

  async findByGroup(tenantCode: string, userGroupId: string): Promise<UserGroupRole[]> {
    return this.repository.find({
      where: { tenantCode, userGroupId },
      relations: ['role'],
    });
  }

  async findRolesByGroupId(tenantCode: string, userGroupId: string): Promise<UserGroupRole[]> {
    return this.findByGroup(tenantCode, userGroupId);
  }

  async deleteByGroup(tenantCode: string, userGroupId: string): Promise<void> {
    await this.repository.delete({ tenantCode, userGroupId });
  }

  async batchDelete(tenantCode: string, userGroupId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;

    await this.repository
      .createQueryBuilder()
      .delete()
      .where(
        'tenantCode = :tenantCode AND userGroupId = :userGroupId AND roleId IN (:...roleIds)',
        {
          tenantCode,
          userGroupId,
          roleIds,
        },
      )
      .execute();
  }

  async bulkSave(roles: UserGroupRole[]): Promise<UserGroupRole[]> {
    return this.repository.save(roles);
  }
}
