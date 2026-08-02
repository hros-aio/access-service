import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { Public } from '@new-hros/libs-apis';
import { Request as ExpressRequest } from 'express';

import { MfaAdminApplicationService } from '../services/mfa_admin_application.service';

interface AuthenticatedRequest extends ExpressRequest {
  user?: {
    tenantCode?: string;
    id?: string;
    userId?: string;
  };
}

@Public()
@Controller('api/v1/admin/users')
export class MfaAdminController {
  constructor(private readonly mfaAdminApplicationService: MfaAdminApplicationService) {}

  @Post(':userId/mfa/reset')
  @HttpCode(HttpStatus.OK)
  public async resetUserMfa(
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    success: boolean;
    targetUserId: string;
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    const tenantCode = req.user?.tenantCode ?? 'tenant-001';
    const adminUserId = req.user?.id ?? req.user?.userId ?? '00000000-0000-0000-0000-000000000000';
    return this.mfaAdminApplicationService.resetUserMfa(tenantCode, targetUserId, adminUserId);
  }
}
