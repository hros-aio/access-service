import { Injectable } from '@nestjs/common';
import {
  BaseRepository,
  PaginatedResult,
  PaginationOptions,
  TransactionService,
} from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { UserGroupMembership } from '../entities/user-group-membership.entity';

@Injectable()
export class UserGroupMembershipRepository extends BaseRepository<UserGroupMembership> {
  constructor(transactionService: TransactionService) {
    super(UserGroupMembership, transactionService);
  }

  async findMembershipsByEmployee(employeeId: string): Promise<UserGroupMembership[]> {
    return this.find(
      {
        employeeId,
      },
      {
        relations: ['userGroup'],
      },
    );
  }

  async findMembershipsByGroup(
    groupId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<UserGroupMembership>> {
    return this.find(
      { tenantCode: this.tenantCode, groupId },
      {
        relations: ['employee'],
        pagination,
      },
    );
  }

  async countByGroup(groupId: string): Promise<number> {
    const count = await this.repository.count({
      where: { tenantCode: this.tenantCode, groupId },
    });
    return count;
  }

  async findMemberEmployeeIdsByGroup(groupId: string): Promise<string[]> {
    const rows = await this.repository.find({
      where: { tenantCode: this.tenantCode, groupId },
      select: ['employeeId'],
    });
    return rows.map((r) => r.employeeId);
  }

  async countMemberEmployeeIdsByGroup(groupId: string): Promise<number> {
    const count = await this.repository.count({
      where: { tenantCode: this.tenantCode, groupId },
    });
    return count;
  }

  async countZeroRoleMembersAfterUnassign(
    groupId: string,
    targetRoleCount: number,
  ): Promise<number> {
    const manager = this.transactionService.getManager();
    const queryResult = await manager
      .query(
        `
        WITH member_employees AS (
          SELECT employee_id
          FROM user_group_memberships
          WHERE tenant_code = $1 AND group_id = $2
        ),
        other_group_roles AS (
          SELECT ugm.employee_id, COUNT(ugr.role_id) AS other_role_count
          FROM user_group_memberships ugm
          INNER JOIN user_groups ug
            ON ug.id = ugm.group_id
            AND ug.tenant_code = ugm.tenant_code
            AND ug.status = 'ACTIVE'
          INNER JOIN user_group_roles ugr
            ON ugr.user_group_id = ug.id
            AND ugr.tenant_code = ug.tenant_code
          WHERE ugm.tenant_code = $1
            AND ugm.group_id != $2
            AND ugm.employee_id IN (SELECT employee_id FROM member_employees)
          GROUP BY ugm.employee_id
        )
        SELECT me.employee_id
        FROM member_employees me
        LEFT JOIN other_group_roles ogr ON ogr.employee_id = me.employee_id
        WHERE COALESCE(ogr.other_role_count, 0) = 0
          AND $3 = 0;
        `,
        [this.tenantCode, groupId, targetRoleCount],
      )
      .catch(() => []);

    return queryResult.length;
  }

  async batchInsert(groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    const entities = employeeIds.map((employeeId) =>
      this.repository.create({
        tenantCode: this.tenantCode,
        groupId,
        employeeId,
        matchedAt: new Date(),
      }),
    );

    await this.repository.save(entities);
  }

  async batchDelete(groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    await this.repository.delete({
      tenantCode: this.tenantCode,
      groupId,
      employeeId: In(employeeIds),
    });
  }

  async deleteSingleMembership(employeeId: string, groupId: string): Promise<void> {
    await this.repository.delete({ tenantCode: this.tenantCode, employeeId, groupId });
  }

  async insertSingleMembership(employeeId: string, groupId: string): Promise<void> {
    const entity = this.repository.create({
      tenantCode: this.tenantCode,
      groupId,
      employeeId,
      matchedAt: new Date(),
    });

    await this.repository.save(entity);
  }
}
