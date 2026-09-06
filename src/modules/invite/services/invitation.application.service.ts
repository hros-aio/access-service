import { Injectable } from '@nestjs/common';
import { RedisCacheProvider, RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { CryptoAdapter } from './crypto.adapter';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from '../../auth/repositories/credential.repository';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { UserRepository } from '../../user/repositories/user.repository';
import { AcceptInvitationDto } from '../dto/invitation.dto';
import {
  AuthInvitationInvalidError,
  AuthSessionStoreUnavailableError,
  InvitationNotAllowedError,
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
  ): Promise<{ userId: string; email: string; tenantCode: string }> {
    const tokenHash = this.cryptoAdapter.hashToken(token);
    const invitation = await this.invitationRepository.findByTokenHashUnscoped(tokenHash);
    if (invitation.isExpired()) {
      throw new AuthInvitationInvalidError();
    }

    const user = await this.userRepository.findByIdUnscoped(invitation.userId);
    return {
      userId: invitation.userId,
      email: user.displayEmail,
      tenantCode: user.tenantCode,
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<{ success: boolean; userId: string }> {
    const tokenHash = this.cryptoAdapter.hashToken(dto.token);

    return this.transactionService.runInTransaction(async () => {
      const invitation =
        await this.invitationRepository.findByTokenHashForUpdateUnscoped(tokenHash);

      if (invitation.isExpired()) {
        throw new AuthInvitationInvalidError();
      }

      const user = await this.userRepository.findByIdForUpdateUnscoped(invitation.userId);
      const { hash: passwordHash, algorithm } = await this.credentialDomainService.hashPassword(
        dto.password,
      );

      const existingCredential = await this.credentialRepository.findActiveByUserForUpdateUnscope(
        user.id,
      );
      if (existingCredential) {
        await this.credentialRepository.update(existingCredential.id, {
          passwordHash,
          algorithm,
          passwordChangedAt: new Date(),
        });
      } else {
        await this.credentialRepository.create({
          userId: user.id,
          passwordHash,
          algorithm,
          status: CredentialStatus.ACTIVE,
          passwordChangedAt: new Date(),
        });
      }

      await this.invitationRepository.update(invitation.id, {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      });

      await this.userRepository.update(user.id, {
        status: UserStatus.ACTIVE,
        credentialStatus: CredentialStatus.ACTIVE,
        securityVersion: user.securityVersion++,
      });

      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = user.tenantCode;
      outbox.userId = user.id;
      outbox.eventType = EventType.AUTHENTICATION_INVITATION_ACCEPTED;
      outbox.sanitizedPayload = {
        userId: user.id,
        tenantCode: user.tenantCode,
        invitationId: invitation.id,
        acceptedAt: invitation.acceptedAt?.toISOString(),
      };
      outbox.publishStatus = 'pending';
      await this.authSecurityEventOutboxRepository.save(outbox);

      await this.revokeSessionsAndChallenges(user.tenantCode, user.id);

      return { success: true, userId: user.id };
    });
  }

  async resendInvitation(
    targetUserId: string,
  ): Promise<{ success: boolean; invitationId: string; rawToken: string; expiresAt: Date }> {
    const currentUserId = RequestContextService.getUser().userId;

    return this.transactionService.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdateUnscoped(targetUserId);
      const activeCredential = await this.credentialRepository.findActiveByUseUnscope(user.id);
      if (activeCredential) {
        throw new InvitationNotAllowedError();
      }

      const targetOldInvitation = await this.invitationRepository.findPreviousByUser(user.id);
      if (targetOldInvitation) {
        await this.invitationRepository.update(targetOldInvitation.id, {
          status: InvitationStatus.REVOKED,
          revokedAt: new Date(),
        });
      }

      const { rawToken, tokenHash } = this.cryptoAdapter.generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const savedInvite = await this.invitationRepository.create({
        userId: user.id,
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt,
        version: targetOldInvitation ? targetOldInvitation.version + 1 : 1,
        issuedBy: currentUserId,
        sentAt: new Date(),
      });

      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = user.tenantCode;
      outbox.userId = user.id;
      outbox.eventType = EventType.AUTHENTICATION_INVITATION_RESENT;
      outbox.sanitizedPayload = {
        invitationId: savedInvite.id,
        recipientEmail: user.displayEmail,
        expiresAt: savedInvite.expiresAt.toISOString(),
        resentByActorId: currentUserId,
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

  private async revokeSessionsAndChallenges(tenantCode: string, userId: string): Promise<void> {
    const client = this.redisCacheProvider.getClient();
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
