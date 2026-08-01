import { IsNotEmpty, IsString } from 'class-validator';

export class LoginWithFirebaseDto {
  @IsString()
  @IsNotEmpty()
  tenantCode!: string;

  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
