import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { ScopeType } from '../domain/enums/scope-type.enum';

export class EstimateScopeImpactDto {
  @ApiProperty({
    enum: ScopeType,
    description:
      'Proposed scope type (SELF, DIRECT_REPORTEES, COMPANY, LOCATION, DEPARTMENT, TENANT_WIDE)',
    example: ScopeType.DEPARTMENT,
  })
  @IsNotEmpty()
  scopeType: ScopeType | string;

  @ApiPropertyOptional({
    description:
      'Reference identifier for entity-anchored scopes (e.g. department ID, company ID, location ID)',
    example: 'dept-eng-01',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  scopeRefId?: string | null;
}
