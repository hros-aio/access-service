import { createHmac, randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { CredentialPolicy } from './credential.policy';
import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../../auth/entities/credential.entity';
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
  WeakPasswordException,
} from '../exceptions/password-reset.exception';
import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
  CredentialAlreadyExistsError,
  InvalidPasswordPolicyError,
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
    const user = await this.userRepository.findOne({
      tenantCode: dto.tenantCode,
      normalizedEmail,
      status: UserStatus.ACTIVE,
    });

    if (!user) {
      this.hashOtpCode('000000');
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
    if (!this.credentialPolicy.validatePasswordStrength(dto.newPassword)) {
      throw new WeakPasswordException();
    }

    const challenge = await this.passwordResetRedisAdapter.getChallenge(
      dto.challengeId,
      dto.tenantCode,
      dto.userId,
    );

    if (!challenge || !challenge.codeVerified || challenge.resetToken !== dto.resetToken) {
      throw new InvalidResetChallengeException();
    }

    await this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findByIdWithLock(dto.userId);

      if (!user) {
        throw new InvalidResetChallengeException();
      }

      const activeCredential = await this.credentialRepository.findOne({
        where: { userId: user.id, status: CredentialStatus.ACTIVE },
      });

      if (activeCredential) {
        activeCredential.status = CredentialStatus.SUPERSEDED;
        await this.credentialRepository.save(activeCredential);
      }

      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.newPassword,
      );

      const newCred = new Credential();
      newCred.userId = user.id;
      newCred.passwordHash = passwordHash;
      newCred.algorithm = algorithm;
      newCred.status = CredentialStatus.ACTIVE;
      newCred.passwordChangedAt = new Date();
      await this.credentialRepository.save(newCred);

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

  async adminInitiateReset(dto: {
    tenantCode: string;
    userId: string;
  }): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      id: dto.userId,
      tenantCode: dto.tenantCode,
      status: UserStatus.ACTIVE,
    });

    if (!user) {
      return { message: 'Password reset workflow initiated for user.' };
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
        initiatedByAdmin: true,
      };
      event.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(event);
    });

    return { message: 'Password reset workflow initiated for user.' };
  }

  async setupPasswordViaSsoFallback(
    flowId: string,
    tenantCode: string,
    userId: string,
    dto: { password: string },
  ): Promise<{
    mfaRequired: boolean;
    accessToken?: string;
    refreshToken?: string;
    mfaSetupToken?: string;
  }> {
    if (!this.credentialPolicy.validatePasswordStrength(dto.password)) {
      throw new InvalidPasswordPolicyError();
    }

    await this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findByIdWithLock(userId);

      if (!user) {
        throw new AuthSessionExpiredError('User not found');
      }

      const existingCredential = await this.credentialRepository.findOne({
        where: { userId: user.id, status: CredentialStatus.ACTIVE },
      });

      if (existingCredential) {
        throw new CredentialAlreadyExistsError();
      }

      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.password,
      );

      const credential = new Credential();
      credential.userId = user.id;
      credential.passwordHash = passwordHash;
      credential.algorithm = algorithm;
      credential.status = CredentialStatus.ACTIVE;
      credential.passwordChangedAt = new Date();
      await this.credentialRepository.save(credential);

      user.status = UserStatus.ACTIVE;
      user.credentialStatus = CredentialStatus.ACTIVE;
      user.securityVersion += 1;
      await this.userRepository.save(user);

      const pendingInvite = await this.invitationRepository.findOne({
        where: { userId: user.id, status: In([InvitationStatus.PENDING, InvitationStatus.SENT]) },
      });

      await this.invitationRepository.cancelPendingInvitations(tenantCode, user.id);

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
}
