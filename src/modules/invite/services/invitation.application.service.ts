import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { CryptoAdapter } from './crypto.adapter';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { EventType, UserStatus, CredentialStatus, InvitationStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../../auth/entities/credential.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from '../../auth/repositories/credential.repository';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { UserRepository } from '../../user/repositories/user.repository';
import { AcceptInvitationDto } from '../dto/invitation.dto';
import { Invitation } from '../entities/invitation.entity';
import {
  AuthInvitationInvalidError,
  AuthSessionStoreUnavailableError,
  InvalidPasswordPolicyError,
  InvitationNotAllowedError,
  CrossTenantAccessDeniedError,
} from '../exceptions/invitation.exception';
import { InvitationRepository } from '../repositories/invitation.repository';

@Injectable()
export class InvitationApplicationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly authSecurityEventOutboxRepository: AuthSecurityEventOutboxRepository,
    private readonly transactionService: TransactionService,
    private readonly cryptoAdapter: CryptoAdapter,
    private readonly credentialDomainService: CredentialDomainService,
    private readonly redisCacheProvider: RedisCacheProvider,
  ) {}

  async validateInvitation(
    token: string,
  ): Promise<{ valid: boolean; userId: string; email: string; tenantCode: string }> {
    const tokenHash = this.cryptoAdapter.hashToken(token);
    const invitation = await this.invitationRepository.findByTokenHash(tokenHash);

    if (
      !invitation ||
      (invitation.status !== InvitationStatus.PENDING &&
        invitation.status !== InvitationStatus.SENT) ||
      invitation.expiresAt < new Date()
    ) {
      throw new AuthInvitationInvalidError();
    }

    const user = await this.userRepository.findById(invitation.userId);

    if (!user) {
      throw new AuthInvitationInvalidError();
    }

    return {
      valid: true,
      userId: invitation.userId,
      email: user.displayEmail,
      tenantCode: user.tenantCode,
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<{ success: boolean; userId: string }> {
    if (!this.validatePasswordPolicy(dto.password)) {
      throw new InvalidPasswordPolicyError();
    }

    const tokenHash = this.cryptoAdapter.hashToken(dto.token);

    return this.transactionService.runInTransaction(async () => {
      const invitation = await this.invitationRepository.findByTokenHash(tokenHash);

      if (
        !invitation ||
        (invitation.status !== InvitationStatus.PENDING &&
          invitation.status !== InvitationStatus.SENT) ||
        invitation.expiresAt < new Date()
      ) {
        throw new AuthInvitationInvalidError();
      }

      const user = await this.userRepository.findByIdWithLock(invitation.userId);

      if (!user) {
        throw new AuthInvitationInvalidError();
      }

      const lockedInvitation = await this.invitationRepository.findOne({
        where: { id: invitation.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !lockedInvitation ||
        (lockedInvitation.status !== InvitationStatus.PENDING &&
          lockedInvitation.status !== InvitationStatus.SENT)
      ) {
        throw new AuthInvitationInvalidError();
      }

      const existingCredential = await this.credentialRepository.findActiveByUserId(user.id);

      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.password,
      );

      if (existingCredential) {
        existingCredential.passwordHash = passwordHash;
        existingCredential.algorithm = algorithm;
        existingCredential.passwordChangedAt = new Date();
        await this.credentialRepository.save(existingCredential);
      } else {
        const newCredential = new Credential();
        newCredential.userId = user.id;
        newCredential.passwordHash = passwordHash;
        newCredential.algorithm = algorithm;
        newCredential.status = 'active';
        newCredential.passwordChangedAt = new Date();
        await this.credentialRepository.save(newCredential);
      }

      lockedInvitation.status = InvitationStatus.ACCEPTED;
      lockedInvitation.acceptedAt = new Date();
      await this.invitationRepository.save(lockedInvitation);

      user.status = UserStatus.ACTIVE;
      user.credentialStatus = CredentialStatus.ACTIVE;
      user.securityVersion += 1;
      await this.userRepository.save(user);

      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = user.tenantCode;
      outbox.userId = user.id;
      outbox.eventType = EventType.AUTHENTICATION_INVITATION_ACCEPTED;
      outbox.sanitizedPayload = {
        userId: user.id,
        tenantCode: user.tenantCode,
        invitationId: lockedInvitation.id,
        acceptedAt: lockedInvitation.acceptedAt.toISOString(),
      };
      outbox.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(outbox);

      await this.revokeSessionsAndChallenges(user.tenantCode, user.id);

      return { success: true, userId: user.id };
    });
  }

  async resendInvitation(
    actorContext: { userId: string; tenantCode: string; userType: string },
    targetUserId: string,
  ): Promise<{ success: boolean; invitationId: string; rawToken: string; expiresAt: Date }> {
    return this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findByIdWithLock(targetUserId);

      if (!user) {
        throw new CrossTenantAccessDeniedError();
      }

      const activeCredential = await this.credentialRepository.findActiveByUserId(user.id);

      if (activeCredential) {
        throw new InvitationNotAllowedError();
      }

      const oldInvitation = await this.invitationRepository.findOne({
        where: { userId: user.id, status: InvitationStatus.PENDING },
        lock: { mode: 'pessimistic_write' },
      });

      const oldInvitationSent = await this.invitationRepository.findOne({
        where: { userId: user.id, status: InvitationStatus.SENT },
        lock: { mode: 'pessimistic_write' },
      });

      const targetOldInvitation = oldInvitation || oldInvitationSent;

      if (targetOldInvitation) {
        targetOldInvitation.status = InvitationStatus.REVOKED;
        targetOldInvitation.revokedAt = new Date();
        await this.invitationRepository.save(targetOldInvitation);
      }

      const { rawToken, tokenHash } = this.cryptoAdapter.generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const newInvitation = new Invitation();
      newInvitation.userId = user.id;
      newInvitation.tokenHash = tokenHash;
      newInvitation.status = InvitationStatus.PENDING;
      newInvitation.expiresAt = expiresAt;
      newInvitation.version = targetOldInvitation ? targetOldInvitation.version + 1 : 1;
      newInvitation.issuedBy = actorContext.userId;
      newInvitation.sentAt = new Date();

      const savedInvite = await this.invitationRepository.save(newInvitation);

      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = user.tenantCode;
      outbox.userId = user.id;
      outbox.eventType = EventType.AUTHENTICATION_INVITATION_RESENT;
      outbox.sanitizedPayload = {
        invitationId: savedInvite.id,
        recipientEmail: user.displayEmail,
        expiresAt: savedInvite.expiresAt.toISOString(),
        resentByActorId: actorContext.userId,
      };
      outbox.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(outbox);

      return {
        success: true,
        invitationId: savedInvite.id,
        rawToken,
        expiresAt: savedInvite.expiresAt,
      };
    });
  }

  private validatePasswordPolicy(password: string): boolean {
    if (!password || password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
  }

  private async revokeSessionsAndChallenges(tenantCode: string, userId: string): Promise<void> {
    const provider = this.redisCacheProvider as unknown as {
      client?: {
        smembers(key: string): Promise<string[]>;
        del(...keys: string[]): Promise<number>;
        keys(pattern: string): Promise<string[]>;
        get(key: string): Promise<string | null>;
      };
    };
    const client = provider.client;
    if (!client) {
      throw new AuthSessionStoreUnavailableError();
    }

    try {
      const userSessionsKey = GenerateUserSessionsKey(tenantCode, userId);
      const sessionIds: string[] = await client.smembers(userSessionsKey);
      if (sessionIds && sessionIds.length > 0) {
        const keys = sessionIds.map((sid) => GenerateSessionKey(sid));
        await client.del(...keys, userSessionsKey);
      }

      const challengeKeys = await client.keys('auth:mfa-challenge:*');
      if (challengeKeys && challengeKeys.length > 0) {
        for (const key of challengeKeys) {
          const val = await client.get(key);
          if (val && (val === userId || val.includes(userId))) {
            await client.del(key);
          }
        }
      }
    } catch (err) {
      throw new AuthSessionStoreUnavailableError();
    }
  }
}
