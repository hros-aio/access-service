import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@new-hros/libs-apis';
import { Response } from 'express';

import { LoginWithPasswordDto } from '../dto/login-with-password.dto';
import { LoginResultResponseDto } from '../dto/result.dto';
import { AuthApplicationService } from '../services/auth.application.service';

import { LoginWithFirebaseDto } from '@/modules/auth/dto/login-with-firebase.dto';

@ApiTags('Authentication')
@Public()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authApplicationService: AuthApplicationService) {}

  @Post('login/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in using email and password' })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: LoginResultResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or restricted access' })
  async login(
    @Body()
    dto: LoginWithPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResultResponseDto> {
    const result = await this.authApplicationService.loginWithPassword(dto);

    // Set HttpOnly refresh token cookie with Secure, SameSite, and __Host- prefix
    if (result.refreshToken) {
      res.cookie('__Host-refresh-token', result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    }

    return {
      authState: result.authState,
      accessToken: result.accessToken,
      challengeId: result.challengeId,
    };
  }

  @Post('login/firebase')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: LoginResultResponseDto,
  })
  async loginWithFirebase(
    @Body() dto: LoginWithFirebaseDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResultResponseDto> {
    const result = await this.authApplicationService.loginWithFirebase(dto);

    // Set HttpOnly refresh token cookie with Secure, SameSite, and __Host- prefix
    if (result.refreshToken) {
      res.cookie('__Host-refresh-token', result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    }

    return {
      authState: result.authState,
      accessToken: result.accessToken,
      challengeId: result.challengeId,
    };
  }
}
