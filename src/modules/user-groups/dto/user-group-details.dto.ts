import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ScopeType, UserGroupStatus } from '../domain/enums';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';
import { UserGroup } from '../entities/user-group.entity';

export class AssignedRoleSummaryDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'HR Specialist' })
  name: string;

  @ApiProperty({ example: 'CUSTOM' })
  roleType: string;
}

export class UserGroupDetailsDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantCode: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: UserGroupStatus })
  status: UserGroupStatus;

  @ApiProperty({ enum: ScopeType })
  scopeType: ScopeType;

  @ApiPropertyOptional()
  scopeRefId?: string;

  @ApiProperty()
  matchingRule: MatchingRule;

  @ApiProperty({ type: [String] })
  ruleAttributeKeys: string[];

  @ApiProperty()
  version: number;

  @ApiProperty()
  projectionVersion: number;

  @ApiProperty()
  isPendingSync: boolean;

  @ApiProperty()
  hasNoAssignedRoles: boolean;

  @ApiProperty({ type: [AssignedRoleSummaryDto] })
  assignedRoles: AssignedRoleSummaryDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static mapToDetailsDto(group: UserGroup): UserGroupDetailsDto {
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

export class PaginatedUserGroupDto {
  @ApiProperty({ type: [UserGroupDetailsDto] })
  data: UserGroupDetailsDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
