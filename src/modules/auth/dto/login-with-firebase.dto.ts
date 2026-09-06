import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginWithFirebaseDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The id token from firebase' })
  idToken: string;
}
