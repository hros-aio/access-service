import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, Public, RequirePermission } from '@new-hros/libs-apis';

import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { SetupPasswordViaSsoDto } from '../dto/setup-password-via-sso.dto';
import { VerifyResetCodeDto } from '../dto/verify-reset-code.dto';
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

  @Public()
  @Post('reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request self-service password reset code' })
  @ApiResponse({ status: 200, description: 'Generic success response' })
  @ApiResponse({ status: 403, description: 'Self-service reset disabled by tenant policy' })
  async requestReset(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RequestPasswordResetDto,
  ): Promise<{ message: string }> {
    return this.passwordService.requestResetCode(dto);
  }

  @Public()
  @Post('reset/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 6-digit OTP reset code' })
  @ApiResponse({ status: 200, description: 'Code verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or expired challenge' })
  @ApiResponse({ status: 429, description: 'Maximum verification attempts exceeded' })
  async verifyCode(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: VerifyResetCodeDto,
  ): Promise<{ valid: boolean; resetToken: string }> {
    return this.passwordService.verifyResetCode(dto);
  }

  @Public()
  @Post('reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm new password using reset token' })
  @ApiResponse({ status: 200, description: 'Password reset completed' })
  @ApiResponse({ status: 400, description: 'Invalid token or weak password' })
  async confirmReset(@Body() dto: ConfirmPasswordResetDto): Promise<{ success: boolean }> {
    return this.passwordService.confirmPasswordReset(dto);
  }

  @Post('admin/users/:userId/password-reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequirePermission('user:security:manage')
  @ApiOperation({ summary: 'Admin-initiated password reset' })
  @ApiResponse({ status: 200, description: 'Password reset workflow initiated for user' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async adminInitiateReset(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ message: string }> {
    return this.passwordService.adminInitiateReset(userId);
  }

  @Post('setup/firebase')
  @UseGuards(RestrictedSessionGuard)
  @ApiOperation({ summary: 'Setup password via company SSO fallback' })
  @ApiResponse({ status: 200, description: 'Password successfully configured' })
  @ApiResponse({ status: 400, description: 'Invalid password policy' })
  @ApiResponse({ status: 401, description: 'Restricted session expired or invalid' })
  @ApiResponse({ status: 409, description: 'Credential already exists' })
  async setupPassword(
    @Req() req: RestrictedSessionRequest,
    @Body()
    dto: SetupPasswordViaSsoDto,
  ): Promise<{
    mfaRequired: boolean;
    accessToken?: string;
    refreshToken?: string;
    mfaSetupToken?: string;
  }> {
    const session = req.session;
    if (!session) {
      throw new AuthSessionExpiredError('Session metadata not set by guard');
    }

    return this.passwordService.setupPasswordViaSsoFallback(session.flowId, session.userId, dto);
  }
}
