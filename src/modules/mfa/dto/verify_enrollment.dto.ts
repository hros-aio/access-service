import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';

import { MfaFactorType } from '../entities/mfa-method.entity';

export class VerifyEnrollmentDto {
  @IsUUID()
  @IsNotEmpty()
  public factorId: string;

  @IsEnum(MfaFactorType)
  @IsNotEmpty()
  public factorType: MfaFactorType;

  @IsString()
  @IsNotEmpty()
  public code: string;
}

export class VerifyEnrollmentResponseDto {
  @ApiProperty({ required: true })
  status: string;

  @ApiProperty({ required: true })
  isPrimary: boolean;

  @ApiProperty()
  enrolledAt?: Date;
}
