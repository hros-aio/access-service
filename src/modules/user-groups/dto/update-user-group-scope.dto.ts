import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

import { ScopeType } from '../domain/enums/scope-type.enum';

export class UpdateUserGroupScopeDto {
  @ApiProperty({
    enum: ScopeType,
    description:
      'Platform scope boundary type (SELF, DIRECT_REPORTEES, COMPANY, LOCATION, DEPARTMENT, TENANT_WIDE)',
    example: ScopeType.DEPARTMENT,
  })
  @IsNotEmpty()
  scopeType: ScopeType | string;

  @ApiPropertyOptional({
    description:
      'Reference identifier for entity-anchored scope types (COMPANY, LOCATION, DEPARTMENT)',
    example: 'dept-eng-01',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  scopeRefId?: string | null;

  @ApiProperty({
    description: 'Expected optimistic concurrency version counter',
    example: 2,
  })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({
    description: 'Explicit confirmation flag required if impact exceeds threshold',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
