import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { UserGroupMembership } from '../entities/user-group-membership.entity';

@Injectable()
export class UserGroupMembershipRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<UserGroupMembership> {
    return this.transactionService.getManager().getRepository(UserGroupMembership);
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

  async findMemberEmployeeIdsByGroup(tenantCode: string, groupId: string): Promise<string[]> {
    const rows = await this.repository.find({
      where: { tenantCode, groupId },
      select: ['employeeId'],
    });
    return rows.map((r) => r.employeeId);
  }

  async batchInsert(tenantCode: string, groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    const manager = this.transactionService.getManager();
    const values = employeeIds
      .map((_, idx) => `(gen_random_uuid(), $1, $2, $${idx + 3}, NOW(), NOW())`)
      .join(', ');

    await manager.query(
      `
      INSERT INTO user_group_memberships (id, tenant_code, group_id, employee_id, matched_at, created_at)
      VALUES ${values}
      ON CONFLICT (tenant_code, group_id, employee_id) DO NOTHING;
      `,
      [tenantCode, groupId, ...employeeIds],
    );
  }

  async batchDelete(tenantCode: string, groupId: string, employeeIds: string[]): Promise<void> {
    if (employeeIds.length === 0) return;

    const manager = this.transactionService.getManager();
    await manager.query(
      `
      DELETE FROM user_group_memberships
      WHERE tenant_code = $1 AND group_id = $2 AND employee_id = ANY($3::uuid[]);
      `,
      [tenantCode, groupId, employeeIds],
    );
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
    const manager = this.transactionService.getManager();
    await manager.query(
      `
      INSERT INTO user_group_memberships (id, tenant_code, group_id, employee_id, matched_at, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
      ON CONFLICT (tenant_code, group_id, employee_id) DO NOTHING;
      `,
      [tenantCode, groupId, employeeId],
    );
  }
}
