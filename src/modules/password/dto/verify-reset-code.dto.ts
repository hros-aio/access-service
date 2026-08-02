import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class VerifyResetCodeDto {
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

  @ApiProperty({ description: '6-digit numeric OTP code', example: '123456' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Verification code must be a 6-digit numeric code' })
  readonly code!: string;
}
