import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class LogoutResponseDto {
  @ApiProperty({
    description: 'Indicates if the logout action completed successfully',
    example: true,
  })
  @IsBoolean()
  readonly success: boolean;

  @ApiProperty({ description: 'Number of active sessions revoked', example: 1 })
  @IsInt()
  readonly revokedSessionsCount: number;
}

export class ForceLogoutRequestDto {
  @ApiPropertyOptional({
    description: 'Reason for admin force logout',
    example: 'ADMIN_FORCE_LOGOUT',
  })
  @IsOptional()
  @IsString()
  readonly reason?: string;
}
