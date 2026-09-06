import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginWithPasswordDto {
  @ApiProperty({ description: 'The email address of the user', example: 'employee@tenant.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'The plaintext password', example: 'SecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: 'Keep the session alive', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
