import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

import { MatchingRuleOperator } from '../domain/value-objects/matching-rule.vo';

export class RuleClausePayloadDto {
  @ApiProperty({ description: 'Target employee attribute to evaluate' })
  @IsNotEmpty()
  @IsString()
  attribute: string;

  @ApiProperty({ description: 'Comparison operator' })
  @IsNotEmpty()
  @IsString()
  operator: MatchingRuleOperator;

  @ApiPropertyOptional({ description: 'Target value for unary/binary comparison' })
  @IsOptional()
  value?: string | number | boolean;

  @ApiPropertyOptional({ description: 'Target values array for IN/NOT_IN operators' })
  @IsOptional()
  @IsArray()
  values?: Array<string | number>;
}

export class DynamicMatchingRuleDto {
  @ApiPropertyOptional({ description: 'Combinator logic', default: 'all', enum: ['all'] })
  @IsOptional()
  @IsIn(['all', 'ALL'])
  combinator?: string;

  @ApiProperty({ description: 'List of matching rule clauses', type: [RuleClausePayloadDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleClausePayloadDto)
  clauses: RuleClausePayloadDto[];
}
