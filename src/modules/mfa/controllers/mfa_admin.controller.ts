import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@new-hros/libs-apis';
import { RequestContext } from '@new-hros/libs-core';

import { MfaAdminApplicationService } from '../services/mfa_admin_application.service';

@Public()
@ApiTags('MFA')
@Controller({ path: 'admin/users', version: '1' })
export class MfaAdminController {
  constructor(private readonly mfaAdminApplicationService: MfaAdminApplicationService) {}

  @Post(':userId/mfa/reset')
  @HttpCode(HttpStatus.OK)
  public async resetUserMfa(
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Request() req: RequestContext,
  ): Promise<{
    success: boolean;
    targetUserId: string;
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    const tenantCode = req.user?.tenantCode ?? 'tenant-001';
    const adminUserId = req.user?.userId ?? '00000000-0000-0000-0000-000000000000';
    return this.mfaAdminApplicationService.resetUserMfa(tenantCode, targetUserId, adminUserId);
  }
}
