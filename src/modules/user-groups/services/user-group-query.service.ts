import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupNotFoundError } from '../domain/exceptions/user-group.exceptions';
import { PaginatedUserGroupDto, UserGroupDetailsDto, UserGroupQueryDto } from '../dto';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupQueryService {
  constructor(private readonly userGroupRepository: UserGroupRepository) {}

  private getActiveTenantCode(): string {
    return RequestContextService.getTenantCode() || '';
  }

  async getUserGroupById(id: string): Promise<UserGroupDetailsDto> {
    const tenantCode = this.getActiveTenantCode();
    const group = await this.userGroupRepository.findByTenantAndId(tenantCode, id);
    if (!group) {
      throw new UserGroupNotFoundError(id);
    }
    return this.mapToDetailsDto(group);
  }

  async listUserGroups(query: UserGroupQueryDto): Promise<PaginatedUserGroupDto> {
    const tenantCode = this.getActiveTenantCode();
    const { items, total } = await this.userGroupRepository.listByTenant(tenantCode, {
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((g) => this.mapToDetailsDto(g)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  private mapToDetailsDto(group: UserGroup): UserGroupDetailsDto {
    const assignedRoles = (group.groupRoles ?? [])
      .filter((gr) => !!gr.role)
      .map((gr) => ({
        id: gr.role!.id,
        name: gr.role!.name,
        roleType: gr.role!.type,
      }));

    return {
      id: group.id,
      tenantCode: group.tenantCode,
      name: group.name,
      description: group.description,
      status: group.status,
      scopeType: group.scopeType,
      scopeRefId: group.scopeRefId,
      matchingRule: group.matchingRule,
      ruleAttributeKeys: group.ruleAttributeKeys ?? [],
      version: group.version,
      projectionVersion: group.projectionVersion,
      isPendingSync: group.version > group.projectionVersion,
      hasNoAssignedRoles: assignedRoles.length === 0,
      assignedRoles,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
