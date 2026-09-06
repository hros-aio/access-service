import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsStrongPassword, MinLength } from 'class-validator';

export class SetupPasswordViaSsoDto {
  @ApiProperty({ description: 'The new password to set' })
  @IsStrongPassword()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
