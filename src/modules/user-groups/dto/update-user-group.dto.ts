import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { MatchingRuleDto } from './create-user-group.dto';
import { ScopeType } from '../domain/enums';

export class UpdateUserGroupDto {
  @ApiProperty({ description: 'Unique name of the user group within the tenant' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Scope type', enum: ScopeType })
  @IsEnum(ScopeType)
  scopeType: ScopeType;

  @ApiPropertyOptional({ description: 'Optional scope anchor ID' })
  @IsOptional()
  @IsString()
  scopeRefId?: string;

  @ApiProperty({ type: MatchingRuleDto, description: 'Dynamic matching rule criteria' })
  @ValidateNested()
  @Type(() => MatchingRuleDto)
  matchingRule: MatchingRuleDto;

  @ApiPropertyOptional({ type: [String], description: 'Assigned role UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  @ApiProperty({
    description: 'Expected version token for optimistic concurrency control',
    example: 1,
  })
  @IsInt()
  version: number;

  @ApiPropertyOptional({
    description: 'Explicit confirmation flag required if impact exceeds the high-impact threshold',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
