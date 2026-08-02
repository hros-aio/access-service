import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ description: 'Code of the tenant organization', example: 'acme-corp' })
  @IsString()
  @IsNotEmpty()
  readonly tenantCode!: string;

  @ApiProperty({ description: 'User account email address', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  readonly email!: string;
}
