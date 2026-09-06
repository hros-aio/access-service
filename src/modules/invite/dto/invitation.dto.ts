import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

const PASSWORD_POLICY = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

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
  @IsStrongPassword(PASSWORD_POLICY, {
    message: 'Password require at least 1 lower, 1 upper, 1 number and 1 special characters',
  })
  password: string;
}
