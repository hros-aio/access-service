import { ApiProperty } from '@nestjs/swagger';

export class ScheduledSweepResponseDto {
  @ApiProperty({ example: true, description: 'Whether the distributed advisory lock was acquired' })
  readonly lockAcquired: boolean;

  @ApiProperty({ example: 5, description: 'Total distinct active tenants evaluated' })
  readonly tenantsScanned: number;

  @ApiProperty({ example: 12, description: 'Total dirty user groups discovered' })
  readonly dirtyGroupsFound: number;

  @ApiProperty({ example: 0, description: 'Total dirty roles discovered' })
  readonly dirtyRolesFound: number;

  @ApiProperty({ example: 12, description: 'Total sync jobs successfully enqueued' })
  readonly jobsEnqueued: number;

  @ApiProperty({ example: 1450, description: 'Duration of the sweep execution in milliseconds' })
  readonly durationMs: number;

  @ApiProperty({
    example: 'Scheduled authorization reconciliation sweep executed successfully',
    description: 'Status message of the sweep execution',
  })
  readonly message: string;
}
