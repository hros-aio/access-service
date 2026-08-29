import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UserGroupRole } from '../entities/user-group-role.entity';

export class AssignedRoleItemDto {
  @ApiProperty({ description: 'Role identifier', format: 'uuid' })
  readonly id: string;

  @ApiProperty({ description: 'Role name', example: 'Branch Manager' })
  readonly name: string;

  @ApiProperty({ description: 'Role type', enum: ['SYSTEM', 'CUSTOM'], example: 'CUSTOM' })
  readonly type: string;

  @ApiPropertyOptional({
    description: 'Role description',
    example: 'Manage local branch operations',
  })
  readonly description?: string;

  @ApiProperty({
    description: 'Number of active capabilities/permissions granted by this role',
    example: 12,
  })
  readonly capabilityCount: number;

  @ApiProperty({ description: 'Timestamp when role was created' })
  readonly createdAt: Date;

  static fromUserGroupRole(userGroupRole: UserGroupRole): AssignedRoleItemDto {
    const role = userGroupRole.role;
    if (!role) {
      throw new Error('UserGroupRole must include a loaded role relation');
    }

    return {
      id: role.id,
      name: role.name,
      type: role.type,
      description: role.description,
      capabilityCount: role.permissions?.length ?? 0,
      createdAt: role.createdAt,
    };
  }
}
