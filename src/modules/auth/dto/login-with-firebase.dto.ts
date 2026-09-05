import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginWithFirebaseDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The tenant code context', example: 'TENANT_123' })
  tenantCode!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The id token from firebase' })
  idToken!: string;
}
