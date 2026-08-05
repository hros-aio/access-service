import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIP,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateAuthenticationSettingsDto {
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  selfServicePasswordResetEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  lockoutEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  lockoutThreshold?: number;

  @IsOptional()
  @IsBoolean()
  ipRestrictionEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  @ValidateIf((o: UpdateAuthenticationSettingsDto) => o.ipRestrictionEnabled === true)
  @ArrayNotEmpty({ message: 'ipAllowList cannot be empty when ipRestrictionEnabled is true' })
  ipAllowList?: string[];

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  version: number;
}

export class AuthenticationSettingsResponseDto {
  tenantCode: string;
  mfaRequired: boolean;
  selfServicePasswordResetEnabled: boolean;
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  ipRestrictionEnabled: boolean;
  ipAllowList: string[];
  version: number;
  updatedAt: Date;
}
