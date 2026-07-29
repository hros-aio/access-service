import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ValidateInvitationQueryDto {
  @ApiProperty({ description: 'The raw invitation token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'The raw invitation token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'The initial password to set' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
