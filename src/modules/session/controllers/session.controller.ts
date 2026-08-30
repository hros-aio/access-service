import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DEFAULT_TENANT_CODE, DEFAULT_USER, RequestContext } from '@new-hros/libs-core';

import { ForceLogoutRequestDto, LogoutResponseDto } from '../dto/logout-response.dto';
import { SessionService } from '../services/session.service';

@ApiTags('Session Management')
@ApiBearerAuth()
@Controller()
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke current device session' })
  @ApiResponse({
    status: 200,
    description: 'Session successfully revoked',
    type: LogoutResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Session store unavailable' })
  async logout(@Req() req: RequestContext): Promise<LogoutResponseDto> {
    const tenantCode = req.user?.tenantCode || DEFAULT_TENANT_CODE;
    const userId = req.user?.userId || DEFAULT_USER.userId;
    const sessionId = req.user?.sessionId || DEFAULT_USER.sessionId;

    return this.sessionService.logoutCurrentSession(tenantCode, userId, sessionId);
  }

  @Post('admin/users/:userId/force-logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin force logout all active sessions for target user' })
  @ApiResponse({
    status: 200,
    description: 'All user sessions successfully revoked',
    type: LogoutResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found within tenant scope' })
  @ApiResponse({ status: 503, description: 'Session store unavailable' })
  async forceLogout(
    @Param('userId') targetUserId: string,
    @Body() body: ForceLogoutRequestDto,
    @Req() req: RequestContext,
  ): Promise<LogoutResponseDto> {
    const tenantCode = req.user?.tenantCode || DEFAULT_TENANT_CODE;
    const adminUserId = req.user?.userId || DEFAULT_USER.userId;

    return this.sessionService.revokeAllUserSessions({
      tenantCode,
      targetUserId,
      adminUserId,
      reason: body?.reason,
    });
  }
}
