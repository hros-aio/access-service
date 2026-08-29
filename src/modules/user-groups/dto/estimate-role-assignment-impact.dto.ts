import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class EstimateRoleAssignmentImpactDto {
  @ApiProperty({
    description: 'Array of target Role UUIDs to evaluate against group memberships',
    type: [String],
    example: ['d3b07384-d113-4c4f-b620-e71465e94f10'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly roleIds: string[];
}

export class RoleAssignmentImpactEstimateDto {
  @ApiProperty({
    description: 'Number of distinct users affected by the role assignment changes',
    example: 150,
  })
  readonly affectedUserCount: number;

  @ApiProperty({
    description: 'Number of users who will be left with 0 active roles across the tenant',
    example: 2,
  })
  readonly zeroRoleUserCount: number;

  @ApiProperty({
    description: 'Whether explicit user confirmation is required to proceed with this update',
    example: true,
  })
  readonly requiresConfirmation: boolean;

  @ApiProperty({ description: 'Platform high-impact threshold evaluated', example: 100 })
  readonly threshold: number;
}
