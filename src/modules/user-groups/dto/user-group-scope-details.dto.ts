import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ScopeType } from '../domain/enums/scope-type.enum';
import { UserGroup } from '../entities/user-group.entity';

export class UserGroupScopeDetailsDto {
  @ApiProperty({ description: 'User Group ID', format: 'uuid' })
  userGroupId: string;

  @ApiProperty({ enum: ScopeType, description: 'Organizational scope boundary' })
  scopeType: ScopeType;

  @ApiPropertyOptional({ description: 'Scope reference identifier', nullable: true })
  scopeRefId?: string | null;

  @ApiProperty({ description: 'Entity version', example: 3 })
  version: number;

  @ApiProperty({ description: 'Last projected version', example: 2 })
  projectionVersion: number;

  @ApiProperty({
    description: 'Whether group is pending reconciliation synchronization',
    example: true,
  })
  isPendingSync: boolean;

  static fromEntity(entity: UserGroup): UserGroupScopeDetailsDto {
    const dto = new UserGroupScopeDetailsDto();
    dto.userGroupId = entity.id;
    dto.scopeType = entity.scopeType;
    dto.scopeRefId = entity.scopeRefId ?? null;
    dto.version = entity.version;
    dto.projectionVersion = entity.projectionVersion;
    dto.isPendingSync = entity.version > entity.projectionVersion;
    return dto;
  }
}
