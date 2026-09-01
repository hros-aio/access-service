import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    description: 'Updated complete list of permission codes for the role',
    example: ['users.read', 'roles.read'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  readonly permissionCodes: string[];

  @ApiPropertyOptional({
    description: 'Expected current version for optimistic concurrency control',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  readonly version?: number;

  @ApiPropertyOptional({
    description:
      'Explicit confirmation flag when revocation or update affects a large active user population',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly confirmed?: boolean;
}
