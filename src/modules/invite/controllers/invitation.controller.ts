import { Body, Controller, Get, Post, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AcceptInvitationDto, ValidateInvitationQueryDto } from '../dto/invitation.dto';
import { InvitationApplicationService } from '../services/invitation.application.service';

@ApiTags('Invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationController {
  constructor(private readonly invitationService: InvitationApplicationService) {}

  @Get('validate')
  @ApiOperation({ summary: 'Validate raw invitation token' })
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 400, description: 'Token is invalid, expired, or revoked' })
  async validate(
    @Query(new ValidationPipe({ transform: true })) query: ValidateInvitationQueryDto,
  ): Promise<{ valid: boolean; userId: string; email: string; tenantCode: string }> {
    return this.invitationService.validateInvitation(query.token);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept invitation and set password' })
  @ApiResponse({ status: 200, description: 'Invitation accepted and account activated' })
  @ApiResponse({ status: 400, description: 'Invalid password policy or invalid token' })
  @ApiResponse({ status: 503, description: 'Redis session store unavailable' })
  async accept(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    dto: AcceptInvitationDto,
  ): Promise<{ success: boolean; userId: string }> {
    return this.invitationService.acceptInvitation(dto);
  }
}
