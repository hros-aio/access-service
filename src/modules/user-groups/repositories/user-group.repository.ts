import { Injectable } from '@nestjs/common';
import {
  BaseRepository,
  PaginatedResult,
  QueryOneOptions,
  TransactionService,
} from '@new-hros/libs-sql';
import { DeepPartial, FindOptionsWhere, Raw } from 'typeorm';

import { UserGroupStatus } from '../domain/enums';
import { UserGroup } from '../entities/user-group.entity';

@Injectable()
export class UserGroupRepository extends BaseRepository<UserGroup> {
  constructor(transactionService: TransactionService) {
    super(UserGroup, transactionService);
  }

  async create(data: DeepPartial<UserGroup>): Promise<UserGroup> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async save(userGroup: UserGroup): Promise<UserGroup> {
    return this.repository.save(userGroup);
  }

  async findFullyById(id: string, options?: QueryOneOptions<UserGroup>): Promise<UserGroup | null> {
    return this.findById(id, {
      ...options,
      relations: ['groupRoles', 'groupRoles.role'],
    });
  }

  async findByName(name: string): Promise<UserGroup | null> {
    return this.findOne({ name });
  }

  async findActiveGroups(): Promise<UserGroup[]> {
    return this.find(
      {
        status: UserGroupStatus.ACTIVE,
      },
      {
        relations: ['groupRoles', 'groupRoles.role'],
      },
    );
  }

  async findByAttributeKeys(attributeKeys: string[]): Promise<UserGroup[]> {
    if (attributeKeys.length === 0) return [];
    return this.repository
      .createQueryBuilder('ug')
      .where('ug.tenant_code = :tenantCode', { tenantCode: this.tenantCode })
      .andWhere('ug.status = :status', { status: UserGroupStatus.ACTIVE })
      .andWhere('ug.rule_attribute_keys && :attributeKeys', { attributeKeys })
      .getMany();
  }

  async updateProjectionVersion(id: string, projectionVersion: number): Promise<void> {
    await this.repository.update({ tenantCode: this.tenantCode, id }, { projectionVersion });
  }

  async list(filters?: {
    status?: UserGroupStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<UserGroup>> {
    const where: FindOptionsWhere<UserGroup> = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      where.name = Raw((alias) => `LOWER(${alias}) LIKE LOWER(:search)`, {
        search: `%${filters.search.trim()}%`,
      });
    }

    return this.find(where, {
      pagination: { page: filters?.page ?? 1, limit: filters?.limit ?? 20 },
      order: { createdAt: 'DESC' },
      relations: ['groupRoles', 'groupRoles.role'],
    });
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
