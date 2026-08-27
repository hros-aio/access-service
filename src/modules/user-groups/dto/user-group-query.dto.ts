import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { UserGroupStatus } from '../domain/enums';

export class UserGroupQueryDto {
  @ApiPropertyOptional({ enum: UserGroupStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(UserGroupStatus)
  status?: UserGroupStatus;

  @ApiPropertyOptional({ description: 'Search term for name matching' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
