import { ApiProperty } from '@nestjs/swagger';

export class CriteriaImpactResponseDto {
  @ApiProperty({ description: 'Current count of members in the user group' })
  currentCount: number;

  @ApiProperty({ description: 'Proposed matching employee count under new criteria' })
  proposedCount: number;

  @ApiProperty({ description: 'Number of employees who will gain membership' })
  gainingCount: number;

  @ApiProperty({ description: 'Number of employees who will lose membership' })
  losingCount: number;
}
