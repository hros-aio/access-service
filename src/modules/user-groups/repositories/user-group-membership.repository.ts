import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { UserGroupMembership } from '../entities/user-group-membership.entity';

@Injectable()
export class UserGroupMembershipRepository extends BaseRepository<UserGroupMembership> {
  constructor(transactionService: TransactionService) {
    super(UserGroupMembership, transactionService);
  }

  async findMembershipsByEmployee(
    tenantCode: string,
    employeeId: string,
  ): Promise<UserGroupMembership[]> {
    return this.repository.find({
      where: { tenantCode, employeeId },
      relations: ['userGroup'],
    });
  }

  async findMembershipsByGroup(
    tenantCode: string,
    groupId: string,
    skip = 0,
    take = 20,
  ): Promise<[UserGroupMembership[], number]> {
    return this.repository.findAndCount({
      where: { tenantCode, groupId },
      relations: ['employee'],
      skip,
      take,
      order: { matchedAt: 'DESC' },
    });
  }

  async countByGroup(tenantCode: string, groupId: string): Promise<number> {
    return this.repository.count({
      where: { tenantCode, groupId },
    });
  }

  async countUserGroupMembers(tenantCode: string, userGroupId: string): Promise<number> {
    return this.countByGroup(tenantCode, userGroupId);
  }

  async findMemberEmployeeIdsByGroup(tenantCode: string, groupId: string): Promise<string[]> {
    const rows = await this.repository.find({
      where: { tenantCode, groupId },
      select: ['employeeId'],
    });
    return rows.map((r) => r.employeeId);
  }

  async countZeroRoleMembersAfterUnassign(
    tenantCode: string,
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
        [tenantCode, groupId, targetRoleCount],
      )
      .catch(() => []);

    return queryResult.length;
  }

  async batchInsert(tenantCode: string, groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    const entities = employeeIds.map((employeeId) =>
      this.repository.create({
        tenantCode,
        groupId,
        employeeId,
        matchedAt: new Date(),
      }),
    );

    await this.repository.save(entities);
  }

  async batchDelete(tenantCode: string, groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    await this.repository.delete({
      tenantCode,
      groupId,
      employeeId: In(employeeIds),
    });
  }

  async deleteSingleMembership(
    tenantCode: string,
    employeeId: string,
    groupId: string,
  ): Promise<void> {
    await this.repository.delete({ tenantCode, employeeId, groupId });
  }

  async insertSingleMembership(
    tenantCode: string,
    employeeId: string,
    groupId: string,
  ): Promise<void> {
    const entity = this.repository.create({
      tenantCode,
      groupId,
      employeeId,
      matchedAt: new Date(),
    });

    await this.repository.save(entity);
  }
}
