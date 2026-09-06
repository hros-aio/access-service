import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

import { MfaFactorStatus, MfaFactorType } from '../entities/mfa-method.entity';

export class EnrollMfaDto {
  @IsEnum(MfaFactorType)
  @IsNotEmpty()
  public factorType: MfaFactorType;
}

export class EnrollMfaResponse {
  @ApiProperty({ required: true })
  factorId: string;

  @ApiProperty({ required: true })
  factorType: MfaFactorType;

  @ApiProperty({ required: true })
  status: MfaFactorStatus;

  @ApiProperty()
  qrCodeUrl?: string;
}
