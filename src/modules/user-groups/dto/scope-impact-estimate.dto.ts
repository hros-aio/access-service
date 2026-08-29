import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ScopeType } from '../domain/enums/scope-type.enum';

export class ScopeDefinitionDto {
  @ApiProperty({ enum: ScopeType, description: 'Organizational scope boundary' })
  scopeType: ScopeType;

  @ApiPropertyOptional({ description: 'Scope reference identifier', nullable: true })
  scopeRefId?: string | null;
}

export class ScopeImpactEstimateDto {
  @ApiProperty({ description: 'User Group ID', format: 'uuid' })
  userGroupId: string;

  @ApiProperty({ description: 'Number of employees matching the user group', example: 45 })
  affectedUserCount: number;

  @ApiProperty({ description: 'Platform high-impact threshold', example: 100 })
  threshold: number;

  @ApiProperty({
    description: 'Whether explicit confirmation is required before committing',
    example: false,
  })
  requiresConfirmation: boolean;

  @ApiProperty({ description: 'Current scope configuration' })
  currentScope: ScopeDefinitionDto;

  @ApiProperty({ description: 'Proposed scope configuration' })
  proposedScope: ScopeDefinitionDto;
}
