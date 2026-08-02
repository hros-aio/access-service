import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'Challenge UUID returned from reset request',
    example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly challengeId!: string;

  @ApiProperty({ description: 'Tenant code associated with challenge', example: 'acme-corp' })
  @IsString()
  @IsNotEmpty()
  readonly tenantCode!: string;

  @ApiProperty({
    description: 'User ID associated with challenge',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly userId!: string;

  @ApiProperty({
    description: 'Short-lived proof token from verification step',
    example: 'e92d4fae-7dec-11d0-a765-00a0c91e6bf7',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly resetToken!: string;

  @ApiProperty({ description: 'New account password', example: 'NewSecurePassword123!' })
  @IsString()
  @MinLength(8)
  readonly newPassword!: string;
}
