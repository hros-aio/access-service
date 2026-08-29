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

  async findMemberEmployeeIdsByGroup(tenantCode: string, groupId: string): Promise<string[]> {
    const rows = await this.repository.find({
      where: { tenantCode, groupId },
      select: ['employeeId'],
    });
    return rows.map((r) => r.employeeId);
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
