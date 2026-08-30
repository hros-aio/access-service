import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { Raw } from 'typeorm';

import { UserGroupStatus } from '../domain/enums';
import { UserGroup } from '../entities/user-group.entity';

@Injectable()
export class UserGroupRepository extends BaseRepository<UserGroup> {
  constructor(transactionService: TransactionService) {
    super(UserGroup, transactionService);
  }

  async save(userGroup: UserGroup): Promise<UserGroup> {
    return this.repository.save(userGroup);
  }

  async create(data: Partial<UserGroup>): Promise<UserGroup> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findByTenantAndId(tenantCode: string, id: string): Promise<UserGroup | null> {
    return this.repository.findOne({
      where: { tenantCode, id },
      relations: ['groupRoles', 'groupRoles.role'],
    });
  }

  async findByTenantAndName(tenantCode: string, name: string): Promise<UserGroup | null> {
    return this.repository.findOne({
      where: { tenantCode, name },
    });
  }

  async findActiveGroups(tenantCode: string): Promise<UserGroup[]> {
    return this.repository.find({
      where: { tenantCode, status: UserGroupStatus.ACTIVE },
      relations: ['groupRoles', 'groupRoles.role'],
    });
  }

  async findByAttributeKeys(tenantCode: string, attributeKeys: string[]): Promise<UserGroup[]> {
    if (attributeKeys.length === 0) return [];
    return this.repository
      .createQueryBuilder('ug')
      .where('ug.tenant_code = :tenantCode', { tenantCode })
      .andWhere('ug.status = :status', { status: UserGroupStatus.ACTIVE })
      .andWhere('ug.rule_attribute_keys && :attributeKeys', { attributeKeys })
      .getMany();
  }

  async updateProjectionVersion(
    tenantCode: string,
    id: string,
    projectionVersion: number,
  ): Promise<void> {
    await this.repository.update({ tenantCode, id }, { projectionVersion });
  }

  async listByTenant(
    tenantCode: string,
    filters?: { status?: UserGroupStatus; search?: string; page?: number; limit?: number },
  ): Promise<{ items: UserGroup[]; total: number }> {
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 20;
    const skip = (page - 1) * limit;

    const qb = this.repository
      .createQueryBuilder('ug')
      .leftJoinAndSelect('ug.groupRoles', 'ugr')
      .leftJoinAndSelect('ugr.role', 'role')
      .where('ug.tenantCode = :tenantCode', { tenantCode });

    if (filters?.status) {
      qb.andWhere('ug.status = :status', { status: filters.status });
    }

    if (filters?.search && filters.search.trim().length > 0) {
      qb.andWhere('LOWER(ug.name) LIKE LOWER(:search)', { search: `%${filters.search.trim()}%` });
    }

    qb.orderBy('ug.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findDirtyUserGroups(): Promise<{ tenantCode: string; id: string; version: number }[]> {
    const groups = await this.repository.find({
      select: ['tenantCode', 'id', 'version'],
      where: {
        version: Raw((alias) => `${alias} <> COALESCE(projection_version, 0)`),
      },
    });

    return groups.map((g) => ({
      tenantCode: g.tenantCode,
      id: g.id,
      version: g.version,
    }));
  }
}
