import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ScopeType } from '../domain/enums';
import { MatchingRuleOperator } from '../domain/value-objects/matching-rule.vo';

export class MatchingRuleClauseDto {
  @ApiProperty({
    description: 'Target employee attribute',
    example: 'departmentId',
    enum: [
      'employmentStatus',
      'companyId',
      'locationId',
      'departmentId',
      'gradeId',
      'jobTitleId',
      'reporteesCount',
      'hasReportees',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'employmentStatus',
    'companyId',
    'locationId',
    'departmentId',
    'gradeId',
    'jobTitleId',
    'reporteesCount',
    'hasReportees',
  ])
  attribute: string;

  @ApiProperty({
    description: 'Evaluation operator',
    example: 'EQUALS',
    enum: [
      'EQUALS',
      'NOT_EQUALS',
      'IN',
      'NOT_IN',
      'GREATER_THAN',
      'LESS_THAN',
      'IS_TRUE',
      'IS_FALSE',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'EQUALS',
    'NOT_EQUALS',
    'IN',
    'NOT_IN',
    'GREATER_THAN',
    'LESS_THAN',
    'IS_TRUE',
    'IS_FALSE',
  ])
  operator: MatchingRuleOperator;

  @ApiPropertyOptional({ description: 'Value for scalar comparisons' })
  @IsOptional()
  value?: string | number | boolean;

  @ApiPropertyOptional({ description: 'Values for collection comparisons', type: [String] })
  @IsOptional()
  @IsArray()
  values?: Array<string | number>;
}

export class MatchingRuleDto {
  @ApiProperty({
    type: [MatchingRuleClauseDto],
    description: 'List of matching rule clauses combined with logical AND',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MatchingRuleClauseDto)
  clauses: MatchingRuleClauseDto[];
}

export class CreateUserGroupDto {
  @ApiProperty({
    description: 'Unique name of the user group within the tenant',
    example: 'Engineering Staff',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Optional description of the group purpose' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Scope type configuration',
    enum: ScopeType,
    example: ScopeType.DEPARTMENT,
  })
  @IsEnum(ScopeType)
  scopeType: ScopeType;

  @ApiPropertyOptional({
    description: 'Optional target entity anchor ID for company/location/department scope',
  })
  @IsOptional()
  @IsString()
  scopeRefId?: string;

  @ApiProperty({ type: MatchingRuleDto, description: 'Dynamic employee matching criteria' })
  @ValidateNested()
  @Type(() => MatchingRuleDto)
  matchingRule: MatchingRuleDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Array of role UUIDs assigned to this user group',
    example: [],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
