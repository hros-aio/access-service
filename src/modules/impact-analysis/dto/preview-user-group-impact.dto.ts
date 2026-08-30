import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

import { ScopeType } from '../../user-groups/domain/enums/scope-type.enum';
import { UserGroupStatus } from '../../user-groups/domain/enums/user-group-status.enum';
import { MatchingRuleDto } from '../../user-groups/dto/create-user-group.dto';

export class PreviewUserGroupImpactDto {
  @ApiPropertyOptional({ description: 'Prospective matching rule' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchingRuleDto)
  readonly matchingRule?: MatchingRuleDto;

  @ApiPropertyOptional({ description: 'Prospective scope type', enum: ScopeType })
  @IsOptional()
  @IsEnum(ScopeType)
  readonly scopeType?: ScopeType;

  @ApiPropertyOptional({ description: 'Prospective scope reference ID' })
  @IsOptional()
  @IsString()
  readonly scopeRefId?: string | null;

  @ApiPropertyOptional({ description: 'Prospective assigned role IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly roleIds?: string[];

  @ApiPropertyOptional({ description: 'Prospective group status', enum: UserGroupStatus })
  @IsOptional()
  @IsEnum(UserGroupStatus)
  readonly status?: UserGroupStatus;
}
