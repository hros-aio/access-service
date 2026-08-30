import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

import { RoleStatus } from '../../roles/interfaces/system-role-template.interface';

export class PreviewRoleImpactDto {
  @ApiPropertyOptional({ description: 'Prospective permission codes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly permissionCodes?: string[];

  @ApiPropertyOptional({ description: 'Prospective role status', enum: RoleStatus })
  @IsOptional()
  @IsEnum(RoleStatus)
  readonly status?: RoleStatus;
}
