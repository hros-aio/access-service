import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateUserGroupRolesDto {
  @ApiProperty({
    description: 'Array of target Role UUIDs to assign to this User Group',
    type: [String],
    example: ['d3b07384-d113-4c4f-b620-e71465e94f10'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly roleIds: string[];

  @ApiProperty({
    description: 'Expected current version of the user group for optimistic concurrency control',
    example: 2,
  })
  @IsInt()
  @Min(1)
  readonly expectedVersion: number;

  @ApiPropertyOptional({
    description: 'Explicit confirmation flag required if impact exceeds the high-impact threshold',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly confirmed?: boolean;
}
