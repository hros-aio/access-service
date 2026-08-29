import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupNotFoundError } from '../domain/exceptions/user-group.exceptions';
import { PaginatedUserGroupDto, UserGroupDetailsDto, UserGroupQueryDto } from '../dto';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupQueryService {
  constructor(private readonly userGroupRepository: UserGroupRepository) {}

  async findById(id: string): Promise<UserGroupDetailsDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const group = await this.userGroupRepository.findByTenantAndId(tenantCode, id);
    if (!group) {
      throw new UserGroupNotFoundError(id);
    }
    return UserGroupDetailsDto.mapToDetailsDto(group);
  }

  async list(query: UserGroupQueryDto): Promise<PaginatedUserGroupDto> {
    const tenantCode = RequestContextService.getTenantCode();
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
      items: items.map((g) => UserGroupDetailsDto.mapToDetailsDto(g)),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
