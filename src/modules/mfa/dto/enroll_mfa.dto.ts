import { IsEnum, IsNotEmpty } from 'class-validator';

export enum MfaFactorType {
  TOTP = 'totp',
  EMAIL = 'email',
}

export class EnrollMfaDto {
  @IsEnum(MfaFactorType)
  @IsNotEmpty()
  public factorType!: MfaFactorType;
}
