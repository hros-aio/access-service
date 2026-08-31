import { ApiProperty } from '@nestjs/swagger';

export class SyncStatusSummaryResponseDto {
  @ApiProperty({ example: 'TENANT_ALPHA' })
  readonly tenantCode: string;

  @ApiProperty({ example: 45 })
  readonly totalEntities: number;

  @ApiProperty({ example: 40 })
  readonly completed: number;

  @ApiProperty({ example: 3 })
  readonly pending: number;

  @ApiProperty({ example: 1 })
  readonly processing: number;

  @ApiProperty({ example: 1 })
  readonly failed: number;

  @ApiProperty({ example: '2026-08-31T20:50:00.000Z' })
  readonly evaluatedAt: Date;
}
