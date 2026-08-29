import { ApiProperty } from '@nestjs/swagger';

export class BootstrapCapabilitiesResponseDto {
  @ApiProperty({ description: 'Current monotonic version of user authorization state', example: 4 })
  authorizationVersion: number;

  @ApiProperty({
    description: 'Cumulative deduplicated list of permission codes granted across all active roles',
    example: ['employee.view', 'leave.apply', 'leave.approve'],
    type: [String],
  })
  permissions: string[];

  @ApiProperty({
    description: 'List of authorized navigation modules derived from the permission catalog',
    example: ['employee-directory', 'leave-management'],
    type: [String],
  })
  modules: string[];

  @ApiProperty({
    description: 'List of active assigned role names or identifiers',
    example: ['Employee', 'Manager'],
    type: [String],
  })
  roles: string[];
}
