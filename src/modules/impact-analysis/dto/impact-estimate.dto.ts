import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImpactEstimateDto {
  @ApiProperty({ description: 'Gross count of users gaining access / membership', example: 150 })
  readonly usersGaining: number;

  @ApiProperty({ description: 'Gross count of users losing access / membership', example: 12 })
  readonly usersLosing: number;

  @ApiProperty({ description: 'Total unique employees affected', example: 162 })
  readonly totalAffected: number;

  @ApiProperty({ description: 'Flag indicating if blast radius exceeds threshold', example: true })
  readonly isHighImpact: boolean;

  @ApiProperty({ description: 'High-impact threshold evaluated against', example: 100 })
  readonly threshold: number;

  @ApiProperty({ description: 'Flag indicating whether exact or estimated', example: false })
  readonly isEstimated: boolean;
}

export class CoverageLossWarningDto {
  @ApiProperty({
    description: 'Critical capability code or system role key',
    example: 'ADMINISTRATOR',
  })
  readonly capabilityCode: string;

  @ApiProperty({ description: 'Prior active holder count', example: 1 })
  readonly priorHoldersCount: number;

  @ApiProperty({ description: 'Projected active holder count after proposed change', example: 0 })
  readonly projectedHoldersCount: number;

  @ApiProperty({ description: 'Flag indicating critical coverage loss', example: true })
  readonly isCriticalLoss: boolean;
}

export class ImpactAnalysisResultDto {
  @ApiProperty({
    description: 'Target entity type',
    enum: ['ROLE', 'USER_GROUP'],
    example: 'USER_GROUP',
  })
  readonly targetType: 'ROLE' | 'USER_GROUP';

  @ApiProperty({ description: 'Target entity ID', example: 'c8a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c' })
  readonly targetId: string;

  @ApiProperty({ description: 'Impact estimate blast radius', type: () => ImpactEstimateDto })
  readonly estimate: ImpactEstimateDto;

  @ApiPropertyOptional({
    description: 'Critical coverage loss warning',
    type: () => CoverageLossWarningDto,
    nullable: true,
  })
  readonly coverageLoss: CoverageLossWarningDto | null;

  @ApiProperty({ description: 'Whether confirmation is required', example: true })
  readonly requiresConfirmation: boolean;
}
