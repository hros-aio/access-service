import { Body, Controller, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SetupPasswordViaSsoDto } from '../dto/setup-password-via-sso.dto';
import { AuthSessionExpiredError } from '../exceptions/password.exception';
import {
  RestrictedSessionGuard,
  RestrictedSessionRequest,
} from '../guards/restricted-session.guard';
import { PasswordService } from '../services/password.service';

@ApiTags('Password')
@Controller({ path: 'auth/password', version: '1' })
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('setup/firebase')
  @UseGuards(RestrictedSessionGuard)
  @ApiOperation({ summary: 'Setup password via company SSO fallback' })
  @ApiResponse({ status: 200, description: 'Password successfully configured' })
  @ApiResponse({ status: 400, description: 'Invalid password policy' })
  @ApiResponse({ status: 401, description: 'Restricted session expired or invalid' })
  @ApiResponse({ status: 409, description: 'Credential already exists' })
  async setupPassword(
    @Req() req: RestrictedSessionRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    dto: SetupPasswordViaSsoDto,
  ): Promise<{
    status: string;
    data: {
      mfaRequired: boolean;
      accessToken?: string;
      refreshToken?: string;
      mfaSetupToken?: string;
    };
  }> {
    const session = req.session;
    if (!session) {
      throw new AuthSessionExpiredError('Session metadata not set by guard');
    }

    const result = await this.passwordService.setupPasswordViaSsoFallback(
      session.flowId,
      session.tenantCode,
      session.userId,
      dto,
    );

    return {
      status: 'success',
      data: result,
    };
  }
}
