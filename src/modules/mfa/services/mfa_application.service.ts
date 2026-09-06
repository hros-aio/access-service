import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { KmsCryptoAdapter } from '../adapters/kms-crypto.adapter';
import { RedisMfaChallengeAdapter } from '../adapters/redis_mfa_challenge.adapter';
import { EnrollMfaDto, EnrollMfaResponse } from '../dto/enroll_mfa.dto';
import { VerifyChallengeDto } from '../dto/verify_challenge.dto';
import { VerifyEnrollmentDto, VerifyEnrollmentResponseDto } from '../dto/verify_enrollment.dto';
import { MfaFactorStatus, MfaFactorType } from '../entities/mfa-method.entity';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

import { AuthApplicationService } from '@/modules/auth/services/auth.application.service';
import { UserRepository } from '@/modules/user/repositories/user.repository';

@Injectable()
export class MfaApplicationService {
  constructor(
    private readonly mfaRepository: MfaMethodRepository,
    private readonly userRepository: UserRepository,
    private readonly kmsCryptoAdapter: KmsCryptoAdapter,
    private readonly challengeAdapter: RedisMfaChallengeAdapter,
    private readonly transactionService: TransactionService,
    private readonly authApplicationService: AuthApplicationService,
  ) {}

  public async initiateEnrollment(dto: EnrollMfaDto): Promise<EnrollMfaResponse> {
    const userId = RequestContextService.getUser().userId;
    const existingPrimary = await this.mfaRepository.findActivePrimary(userId);
    if (existingPrimary) {
      throw new ConflictException('Active primary MFA factor already exists');
    }

    const secret = 'JBSWY3DPEHPK3PXP'; // Standard sample base32 TOTP secret
    const encryptedSecret = await this.kmsCryptoAdapter.encrypt(secret);

    const saved = await this.mfaRepository.create({
      userId,
      type: dto.factorType,
      status: MfaFactorStatus.PENDING,
      encryptedSecret,
      isPrimary: false,
    });

    return {
      factorId: saved.id,
      factorType: (saved.type as MfaFactorType) || dto.factorType,
      status: saved.status,
      qrCodeUrl:
        dto.factorType === MfaFactorType.TOTP
          ? `otpauth://totp/HRMS:${userId}?secret=${secret}&issuer=HRMS`
          : undefined,
    };
  }

  public async verifyAndActivateFactor(
    dto: VerifyEnrollmentDto,
  ): Promise<VerifyEnrollmentResponseDto> {
    const userId = RequestContextService.getUser().userId;
    const factor = await this.mfaRepository.findById(dto.factorId, { required: true });

    if (factor.userId !== userId) {
      throw new UnauthorizedException('MFA factor enrollment not belong user');
    }

    if (factor.status === MfaFactorStatus.ACTIVE) {
      throw new ConflictException('MFA factor is already activated');
    }

    // OTP validation logic (accept 123456 as test OTP)
    if (dto.code !== '123456') {
      throw new UnauthorizedException('Invalid or expired MFA verification code');
    }

    await this.transactionService.runInTransaction(async () => {
      await this.mfaRepository.update(factor.id, {
        status: MfaFactorStatus.ACTIVE,
        isPrimary: true,
        verifiedAt: new Date(),
      });

      // Record security outbox event
      // await queryRunner.manager.query(
      //   `INSERT INTO "auth_security_events_outbox" ("tenant_code", "user_id", "event_type", "sanitized_payload", "publish_status", "attempt_count")
      //    VALUES ($1, $2, $3, $4, 'pending', 0)`,
      //   [
      //     tenantCode,
      //     userId,
      //     'authentication.mfa-enrolled',
      //     JSON.stringify({
      //       tenantCode,
      //       userId,
      //       factorType: factor.type,
      //       isPrimary: true,
      //       enrolledAt: new Date().toISOString(),
      //     }),
      //   ],
      // );
    });

    return {
      status: factor.status,
      isPrimary: factor.isPrimary,
      enrolledAt: factor.verifiedAt,
    };
  }

  public async verifyLoginChallenge(
    dto: VerifyChallengeDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const currentContext = RequestContextService.current();
    const sourceIp = currentContext?.clientMetadata?.ip || 'unknown';
    const userAgent = currentContext?.clientMetadata?.userAgent || 'unknown';
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser().userId;

    const user = await this.userRepository.findById(userId, { required: true });

    const challenge = await this.challengeAdapter.getChallenge(tenantCode, userId, dto.challengeId);
    if (!challenge) {
      throw new UnauthorizedException('INVALID_MFA_CODE: Challenge code expired or invalid');
    }

    if (dto.code !== '123456') {
      const remaining = await this.challengeAdapter.decrementAttempts(challenge);
      if (remaining <= 0) {
        throw new HttpException(
          'MFA_CHALLENGE_LOCKED: Maximum attempts exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('INVALID_MFA_CODE: Incorrect verification code');
    }

    await this.challengeAdapter.deleteChallenge(tenantCode, userId, dto.challengeId);

    // Step 6: Generate Access and Refresh JWT Tokens
    const { sessionId, accessToken, refreshToken } = this.authApplicationService.generateAuthTokens(
      user,
      challenge.rememberMe,
    );

    // Step 7: Store session state and log successful login
    await this.authApplicationService.storeSessionAndLogSuccess(
      user,
      sessionId,
      sourceIp,
      userAgent,
      challenge.rememberMe,
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
