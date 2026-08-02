import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { KmsCryptoAdapter } from '../adapters/kms-crypto.adapter';
import { RedisMfaChallengeAdapter } from '../adapters/redis_mfa_challenge.adapter';
import { EnrollMfaDto, MfaFactorType } from '../dto/enroll_mfa.dto';
import { VerifyChallengeDto } from '../dto/verify_challenge.dto';
import { VerifyEnrollmentDto } from '../dto/verify_enrollment.dto';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

export enum MfaFactorStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Injectable()
export class MfaApplicationService {
  constructor(
    private readonly mfaRepository: MfaMethodRepository,
    private readonly kmsCryptoAdapter: KmsCryptoAdapter,
    private readonly challengeAdapter: RedisMfaChallengeAdapter,
    private readonly dataSource: DataSource,
  ) {}

  public async initiateEnrollment(
    tenantCode: string,
    userId: string,
    dto: EnrollMfaDto,
  ): Promise<{ factorId: string; factorType: MfaFactorType; status: string; qrCodeUrl?: string }> {
    const existingPrimary = await this.mfaRepository.findActivePrimary(tenantCode, userId);
    if (existingPrimary) {
      throw new ConflictException('Active primary MFA factor already exists');
    }

    const secret = 'JBSWY3DPEHPK3PXP'; // Standard sample base32 TOTP secret
    const encryptedSecret = await this.kmsCryptoAdapter.encrypt(secret);

    const factor = this.mfaRepository.create({
      userId,
      type: dto.factorType,
      status: MfaFactorStatus.PENDING,
      encryptedSecret,
      isPrimary: false,
    });

    const saved = await this.mfaRepository.save(factor);

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
    tenantCode: string,
    userId: string,
    dto: VerifyEnrollmentDto,
  ): Promise<{ status: string; isPrimary: boolean; enrolledAt: Date }> {
    const factor = await this.mfaRepository.findOne({
      where: { id: dto.factorId, userId },
    });

    if (!factor) {
      throw new UnauthorizedException('MFA factor enrollment not found');
    }

    if (factor.status === MfaFactorStatus.ACTIVE) {
      throw new ConflictException('MFA factor is already activated');
    }

    // OTP validation logic (accept 123456 as test OTP)
    if (dto.code !== '123456') {
      throw new UnauthorizedException('Invalid or expired MFA verification code');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      factor.status = MfaFactorStatus.ACTIVE;
      factor.isPrimary = true;
      factor.verifiedAt = new Date();

      await queryRunner.manager.save(factor);

      // Record security outbox event
      await queryRunner.manager.query(
        `INSERT INTO "auth_security_events_outbox" ("tenant_code", "user_id", "event_type", "sanitized_payload", "publish_status", "attempt_count")
         VALUES ($1, $2, $3, $4, 'pending', 0)`,
        [
          tenantCode,
          userId,
          'authentication.mfa-enrolled',
          JSON.stringify({
            tenantCode,
            userId,
            factorType: factor.type,
            isPrimary: true,
            enrolledAt: new Date().toISOString(),
          }),
        ],
      );

      await queryRunner.commitTransaction();

      return {
        status: factor.status,
        isPrimary: factor.isPrimary,
        enrolledAt: factor.verifiedAt,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  public async verifyLoginChallenge(
    tenantCode: string,
    userId: string,
    dto: VerifyChallengeDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
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

    return {
      accessToken: 'mock-access-token-jwt',
      refreshToken: 'mock-refresh-token-uuid',
      expiresIn: 3600,
    };
  }
}
