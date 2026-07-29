import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthGuard,
  PermissionGuard,
  RequirePermission,
  CurrentUser,
  JwtPayload,
} from '@new-hros/libs-apis';

import { InvitationApplicationService } from '../services/invitation.application.service';

@ApiTags('Admin Invitations')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionGuard)
@Controller({ path: 'admin/users', version: '1' })
export class AdminInvitationController {
  constructor(private readonly invitationService: InvitationApplicationService) {}

  @Post(':userId/invitation/resend')
  @RequirePermission('access.user.resend-invitation')
  @ApiOperation({ summary: 'Admin resend onboarding invitation link' })
  @ApiResponse({ status: 200, description: 'Invitation successfully resent' })
  @ApiResponse({ status: 404, description: 'User not found or cross-tenant access denied' })
  @ApiResponse({ status: 409, description: 'User already has active credential' })
  async resend(
    @CurrentUser() actor: JwtPayload,
    @Param('userId') targetUserId: string,
  ): Promise<{ success: boolean; invitationId: string; rawToken: string; expiresAt: Date }> {
    return this.invitationService.resendInvitation(
      {
        userId: actor?.sub || '',
        tenantCode: actor?.tenantCode || '',
        userType: 'admin',
      },
      targetUserId,
    );
  }
}
