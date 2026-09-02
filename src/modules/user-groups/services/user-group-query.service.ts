import { Injectable } from '@nestjs/common';

import { PaginatedUserGroupDto, UserGroupDetailsDto, UserGroupQueryDto } from '../dto';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupQueryService {
  constructor(private readonly userGroupRepository: UserGroupRepository) {}

  async findById(id: string): Promise<UserGroupDetailsDto> {
    const group = await this.userGroupRepository.findById(id, {
      required: true,
      relations: ['groupRoles', 'groupRoles.role'],
    });
    return UserGroupDetailsDto.mapToDetailsDto(group);
  }

  async list(query: UserGroupQueryDto): Promise<PaginatedUserGroupDto> {
    const { data, ...pagination } = await this.userGroupRepository.list({
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map((g) => UserGroupDetailsDto.mapToDetailsDto(g)),
      ...pagination,
    };
  }
}
