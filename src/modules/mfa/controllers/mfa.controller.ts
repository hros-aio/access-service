import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { Public } from '@new-hros/libs-apis';
import { Request as ExpressRequest } from 'express';

import { EnrollMfaDto } from '../dto/enroll_mfa.dto';
import { VerifyChallengeDto } from '../dto/verify_challenge.dto';
import { VerifyEnrollmentDto } from '../dto/verify_enrollment.dto';
import { MfaApplicationService } from '../services/mfa_application.service';

export interface AuthenticatedRequest extends ExpressRequest {
  user?: {
    tenantCode?: string;
    id?: string;
    userId?: string;
  };
}

@Public()
@Controller('api/v1/auth/mfa')
export class MfaController {
  constructor(private readonly mfaApplicationService: MfaApplicationService) {}

  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  public async initiateEnrollment(
    @Body(new ValidationPipe({ transform: true })) dto: EnrollMfaDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const tenantCode = req.user?.tenantCode ?? 'tenant-001';
    const userId = req.user?.id ?? req.user?.userId ?? '00000000-0000-0000-0000-000000000001';
    return this.mfaApplicationService.initiateEnrollment(tenantCode, userId, dto);
  }

  @Post('enroll/verify')
  @HttpCode(HttpStatus.OK)
  public async verifyEnrollment(
    @Body(new ValidationPipe({ transform: true })) dto: VerifyEnrollmentDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const tenantCode = req.user?.tenantCode ?? 'tenant-001';
    const userId = req.user?.id ?? req.user?.userId ?? '00000000-0000-0000-0000-000000000001';
    return this.mfaApplicationService.verifyAndActivateFactor(tenantCode, userId, dto);
  }

  @Post('challenge/verify')
  @HttpCode(HttpStatus.OK)
  public async verifyChallenge(
    @Body(new ValidationPipe({ transform: true })) dto: VerifyChallengeDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const tenantCode = req.user?.tenantCode ?? 'tenant-001';
    const userId = req.user?.id ?? req.user?.userId ?? '00000000-0000-0000-0000-000000000001';
    return this.mfaApplicationService.verifyLoginChallenge(tenantCode, userId, dto);
  }
}
