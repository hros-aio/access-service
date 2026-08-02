import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';

import { MfaFactorType } from './enroll_mfa.dto';

export class VerifyEnrollmentDto {
  @IsUUID()
  @IsNotEmpty()
  public factorId!: string;

  @IsEnum(MfaFactorType)
  @IsNotEmpty()
  public factorType!: MfaFactorType;

  @IsString()
  @IsNotEmpty()
  public code!: string;
}
