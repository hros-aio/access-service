import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@new-hros/libs-apis';

import { MfaAdminApplicationService } from '../services/mfa_admin_application.service';

@Public()
@ApiTags('MFA')
@Controller({ path: 'admin/users', version: '1' })
export class MfaAdminController {
  constructor(private readonly mfaAdminApplicationService: MfaAdminApplicationService) {}

  @Post(':userId/mfa/reset')
  @HttpCode(HttpStatus.OK)
  public async resetUserMfa(@Param('userId', new ParseUUIDPipe()) targetUserId: string): Promise<{
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    return this.mfaAdminApplicationService.resetUserMfa(targetUserId);
  }
}
