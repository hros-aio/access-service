import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@new-hros/libs-apis';
import { Response } from 'express';

import { EnrollMfaDto, EnrollMfaResponse } from '../dto/enroll_mfa.dto';
import { VerifyChallengeDto } from '../dto/verify_challenge.dto';
import { VerifyEnrollmentDto, VerifyEnrollmentResponseDto } from '../dto/verify_enrollment.dto';
import { MfaApplicationService } from '../services/mfa_application.service';

@Public()
@ApiTags('MFA')
@Controller({ path: 'auth/mfa', version: '1' })
export class MfaController {
  constructor(private readonly mfaApplicationService: MfaApplicationService) {}

  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  public async initiateEnrollment(@Body() dto: EnrollMfaDto): Promise<EnrollMfaResponse> {
    return this.mfaApplicationService.initiateEnrollment(dto);
  }

  @Post('enroll/verify')
  @HttpCode(HttpStatus.OK)
  public async verifyEnrollment(
    @Body() dto: VerifyEnrollmentDto,
  ): Promise<VerifyEnrollmentResponseDto> {
    return this.mfaApplicationService.verifyAndActivateFactor(dto);
  }

  @Post('challenge/verify')
  @HttpCode(HttpStatus.OK)
  public async verifyChallenge(
    @Body() dto: VerifyChallengeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } =
      await this.mfaApplicationService.verifyLoginChallenge(dto);
    // Set HttpOnly refresh token cookie with Secure, SameSite, and __Host- prefix
    if (refreshToken) {
      res.cookie('__Host-refresh-token', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    }

    return { accessToken };
  }
}
