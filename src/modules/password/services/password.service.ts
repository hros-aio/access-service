import { createHmac, randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { RedisCacheProvider, RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { CredentialPolicy } from './credential.policy';
import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from '../../auth/repositories/credential.repository';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { AuthenticationSettingsRepository } from '../../tenant/repositories/authentication-settings.repository';
import { UserRepository } from '../../user/repositories/user.repository';
import { PasswordResetRedisAdapter } from '../adapters/password-reset-redis.adapter';
import {
  InvalidResetChallengeException,
  InvalidResetCodeException,
  MaxAttemptsExceededException,
  SelfServiceResetDisabledException,
} from '../exceptions/password-reset.exception';
import {
  AuthStoreUnavailableError,
  CredentialAlreadyExistsError,
} from '../exceptions/password.exception';

@Injectable()
export class PasswordService {
  private readonly hmacSecret = process.env.RESET_HMAC_SECRET || 'default-reset-hmac-secret';

  constructor(
    private readonly userRepository: UserRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly authSecurityEventOutboxRepository: AuthSecurityEventOutboxRepository,
    private readonly authenticationSettingsRepository: AuthenticationSettingsRepository,
    private readonly transactionService: TransactionService,
    private readonly credentialDomainService: CredentialDomainService,
    private readonly credentialPolicy: CredentialPolicy,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly sessionApplicationService: SessionApplicationService,
    private readonly invitationRepository: InvitationRepository,
    private readonly passwordResetRedisAdapter: PasswordResetRedisAdapter,
  ) {}

  private hashOtpCode(code: string): string {
    return createHmac('sha256', this.hmacSecret).update(code).digest('hex');
  }

  private generate6DigitOtp(): string {
    const num = Math.floor(100000 + Math.random() * 900000);
    return num.toString();
  }

  async requestResetCode(dto: { tenantCode: string; email: string }): Promise<{ message: string }> {
    const settings = await this.authenticationSettingsRepository.findByTenantCode(dto.tenantCode);
    if (settings && settings.needAdminResetPassword) {
      throw new SelfServiceResetDisabledException();
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findOne(
      {
        tenantCode: dto.tenantCode,
        normalizedEmail,
        status: UserStatus.ACTIVE,
      },
      { withTenancy: false },
    );

    if (!user) {
      this.preventBruteForceAttack();
      return { message: 'If an active account exists, recovery instructions have been sent.' };
    }

    const rawCode = this.generate6DigitOtp();
    const hashedCode = this.hashOtpCode(rawCode);
    const challengeId = randomUUID();

    await this.passwordResetRedisAdapter.saveChallenge(challengeId, {
      tenantCode: dto.tenantCode,
      userId: user.id,
      hashedCode,
      codeVerified: false,
    });

    await this.transactionService.runInTransaction(async () => {
      const event = new AuthSecurityEventOutbox();
      event.tenantCode = dto.tenantCode;
      event.userId = user.id;
      event.eventType = 'authentication.password-reset-requested' as EventType;
      event.sanitizedPayload = {
        tenantCode: dto.tenantCode,
        userId: user.id,
        deliveryEmail: user.displayEmail,
        challengeId,
        initiatedByAdmin: false,
      };
      event.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(event);
    });

    return { message: 'If an active account exists, recovery instructions have been sent.' };
  }

  async verifyResetCode(dto: {
    challengeId: string;
    tenantCode: string;
    userId: string;
    code: string;
  }): Promise<{ valid: boolean; resetToken: string }> {
    const challenge = await this.passwordResetRedisAdapter.getChallenge(
      dto.challengeId,
      dto.tenantCode,
      dto.userId,
    );

    if (!challenge) {
      throw new InvalidResetChallengeException();
    }

    if (challenge.attempts >= 3) {
      throw new MaxAttemptsExceededException();
    }

    const submittedHash = this.hashOtpCode(dto.code);
    if (submittedHash !== challenge.hashedCode) {
      const attempts = await this.passwordResetRedisAdapter.incrementAttempts(
        dto.challengeId,
        dto.tenantCode,
        dto.userId,
      );
      if (attempts >= 3) {
        throw new MaxAttemptsExceededException();
      }
      throw new InvalidResetCodeException();
    }

    const resetToken = randomUUID();
    await this.passwordResetRedisAdapter.markCodeVerified(
      dto.challengeId,
      dto.tenantCode,
      dto.userId,
      resetToken,
    );

    return { valid: true, resetToken };
  }

  async confirmPasswordReset(dto: {
    challengeId: string;
    tenantCode: string;
    userId: string;
    resetToken: string;
    newPassword: string;
  }): Promise<{ success: boolean }> {
    const challenge = await this.passwordResetRedisAdapter.getChallenge(
      dto.challengeId,
      dto.tenantCode,
      dto.userId,
    );

    if (!challenge || !challenge.codeVerified || challenge.resetToken !== dto.resetToken) {
      throw new InvalidResetChallengeException();
    }

    await this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdateUnscoped(dto.userId);
      const activeCredential = await this.credentialRepository.findActiveByUserForUpdateUnscope(
        dto.userId,
      );

      if (activeCredential) {
        activeCredential.status = CredentialStatus.SUPERSEDED;
        await this.credentialRepository.update(activeCredential.id, {
          status: CredentialStatus.SUPERSEDED,
        });
      }

      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.newPassword,
      );

      await this.credentialRepository.create({
        userId: user.id,
        passwordHash,
        algorithm,
        status: CredentialStatus.ACTIVE,
        passwordChangedAt: new Date(),
      });

      user.securityVersion += 1;
      await this.userRepository.save(user);

      const event = new AuthSecurityEventOutbox();
      event.tenantCode = dto.tenantCode;
      event.userId = user.id;
      event.eventType = 'authentication.password-reset-completed' as EventType;
      event.sanitizedPayload = {
        tenantCode: dto.tenantCode,
        userId: user.id,
        resetMethod: 'self_service',
      };
      event.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(event);
    });

    try {
      await this.sessionApplicationService.revokeAllSessions(dto.tenantCode, dto.userId);
    } catch (err) {
      // Best-effort session revocation logging
    }

    await this.passwordResetRedisAdapter.deleteChallenge(
      dto.challengeId,
      dto.tenantCode,
      dto.userId,
    );

    return { success: true };
  }

  async adminInitiateReset(userId: string): Promise<{ message: string }> {
    const tenantCode = RequestContextService.getTenantCode();
    const user = await this.userRepository.findOne(
      {
        id: userId,
        status: UserStatus.ACTIVE,
      },
      { required: true },
    );

    const rawCode = this.generate6DigitOtp();
    const hashedCode = this.hashOtpCode(rawCode);
    const challengeId = randomUUID();

    await this.passwordResetRedisAdapter.saveChallenge(challengeId, {
      tenantCode,
      userId: user.id,
      hashedCode,
      codeVerified: false,
    });

    await this.transactionService.runInTransaction(async () => {
      const event = new AuthSecurityEventOutbox();
      event.tenantCode = tenantCode;
      event.userId = user.id;
      event.eventType = 'authentication.password-reset-requested' as EventType;
      event.sanitizedPayload = {
        tenantCode,
        userId: user.id,
        deliveryEmail: user.displayEmail,
        challengeId,
        initiatedByAdmin: true,
      };
      event.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(event);
    });

    return { message: 'Password reset workflow initiated for user.' };
  }

  async setupPasswordViaSsoFallback(
    flowId: string,
    userId: string,
    dto: { password: string },
  ): Promise<{
    mfaRequired: boolean;
    accessToken?: string;
    refreshToken?: string;
    mfaSetupToken?: string;
  }> {
    const tenantCode = RequestContextService.getTenantCode();

    await this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findById(userId, { required: true });

      const existingCredential = await this.credentialRepository.findOne({
        userId: user.id,
        status: CredentialStatus.ACTIVE,
      });

      if (existingCredential) {
        throw new CredentialAlreadyExistsError();
      }

      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.password,
      );

      await this.credentialRepository.create({
        userId: user.id,
        passwordHash,
        algorithm,
        status: CredentialStatus.ACTIVE,
        passwordChangedAt: new Date(),
      });

      await this.userRepository.update(user.id, {
        status: UserStatus.ACTIVE,
        credentialStatus: CredentialStatus.ACTIVE,
        securityVersion: user.securityVersion++,
      });

      const pendingInvite = await this.invitationRepository.findOne({
        userId: user.id,
        status: In([InvitationStatus.PENDING, InvitationStatus.SENT]),
      });
      if (pendingInvite) {
        const invitationAcceptedEvent = new AuthSecurityEventOutbox();
        invitationAcceptedEvent.tenantCode = tenantCode;
        invitationAcceptedEvent.userId = user.id;
        invitationAcceptedEvent.eventType = EventType.AUTHENTICATION_INVITATION_ACCEPTED;
        invitationAcceptedEvent.sanitizedPayload = {
          userId: user.id,
          invitationId: pendingInvite.id,
          supersededBy: 'SSO_SETUP',
        };
        invitationAcceptedEvent.publishStatus = 'pending';
        await this.authSecurityEventOutboxRepository.save(invitationAcceptedEvent);
      }
      await this.invitationRepository.cancelPendingInvitations(user.id);

      const passwordChangedEvent = new AuthSecurityEventOutbox();
      passwordChangedEvent.tenantCode = tenantCode;
      passwordChangedEvent.userId = user.id;
      passwordChangedEvent.eventType = EventType.AUTHENTICATION_PASSWORD_CHANGED;
      passwordChangedEvent.sanitizedPayload = {
        userId: user.id,
        changeReason: 'SSO_FALLBACK_FIRST_TIME_SETUP',
        actor: {
          userId: user.id,
          type: 'USER',
        },
      };
      passwordChangedEvent.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(passwordChangedEvent);
    });

    try {
      await this.sessionApplicationService.revokeAllSessions(tenantCode, userId);
    } catch (err) {
      throw new AuthStoreUnavailableError();
    }

    const redisKey = `auth:sso-setup:${flowId}`;
    try {
      const client = this.redisCacheProvider.getClient();
      if (client) {
        await client.del(redisKey);
      }
    } catch (err) {
      // best-effort: do not rethrow or fail the request
    }

    return {
      mfaRequired: false,
    };
  }

  private preventBruteForceAttack(): void {
    this.hashOtpCode('000000');
  }
}
