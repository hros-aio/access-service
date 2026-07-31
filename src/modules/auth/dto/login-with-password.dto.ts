import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginWithPasswordDto {
  @ApiProperty({ description: 'The tenant code context', example: 'TENANT_123' })
  @IsString()
  @IsNotEmpty()
  tenantCode: string;

  @ApiProperty({ description: 'The email address of the user', example: 'employee@tenant.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'The plaintext password', example: 'SecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Keep the session alive', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
