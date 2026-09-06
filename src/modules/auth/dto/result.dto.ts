import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';

export class LoginResultResponseDto {
  @ApiProperty()
  authState: string;

  @ApiProperty()
  accessToken?: string;

  @ApiHideProperty()
  refreshToken?: string;

  @ApiProperty()
  challengeId?: string;
}
