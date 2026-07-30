import { Injectable } from '@nestjs/common';
import { BusinessException, RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { CredentialPolicy } from './credential.policy';
import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../../auth/entities/credential.entity';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { Invitation } from '../../invite/entities/invitation.entity';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { User } from '../../user/entities/user.entity';
import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
  CredentialAlreadyExistsError,
  InvalidPasswordPolicyError,
} from '../exceptions/password.exception';

@Injectable()
export class PasswordService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly credentialDomainService: CredentialDomainService,
    private readonly credentialPolicy: CredentialPolicy,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly sessionApplicationService: SessionApplicationService,
    private readonly invitationRepository: InvitationRepository,
  ) {}

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
    // 1. Validate password policy strength
    if (!this.credentialPolicy.validatePasswordStrength(dto.password)) {
      throw new InvalidPasswordPolicyError();
    }

    // 2. Open PostgreSQL transaction
    await this.transactionService.runInTransaction(async () => {
      const entityManager = this.transactionService.getManager();
      const usersRepo = entityManager.getRepository(User);
      const credentialsRepo = entityManager.getRepository(Credential);
      const invitationsRepo = entityManager.getRepository(Invitation);
      const outboxRepo = entityManager.getRepository(AuthSecurityEventOutbox);

      // 3. Lock user row
      const user = await usersRepo.findOne({
        where: { id: userId, tenantCode },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new AuthSessionExpiredError('User not found');
      }

      // 4. Invariant Verification: Check if an active credential already exists
      const existingCredential = await credentialsRepo.findOne({
        where: { userId: user.id, status: 'active' },
      });

      if (existingCredential) {
        throw new CredentialAlreadyExistsError();
      }

      // 5. Hash password
      const passwordHash = await this.credentialDomainService.hashPassword(dto.password);

      // 6. Insert new active credential
      const credential = new Credential();
      credential.userId = user.id;
      credential.passwordHash = passwordHash;
      credential.algorithm = 'argon2id';
      credential.status = 'active';
      credential.passwordChangedAt = new Date();
      await credentialsRepo.save(credential);

      // 7. Update user status and security_version
      user.status = UserStatus.ACTIVE;
      user.credentialStatus = CredentialStatus.ACTIVE;
      user.securityVersion += 1;
      await usersRepo.save(user);

      // 8. Cancel pending/sent invitations for the user (US2)
      const pendingInvite = await invitationsRepo.findOne({
        where: { userId: user.id, status: In([InvitationStatus.PENDING, InvitationStatus.SENT]) },
      });

      await this.invitationRepository.cancelPendingInvitations(tenantCode, user.id);

      // 9. Append Outbox Audit Records
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
      await outboxRepo.save(passwordChangedEvent);

      // Save invitation superseded event if there was any invitation cancelled
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
        await outboxRepo.save(invitationAcceptedEvent);
      }

      // 10. Clear old sessions in Redis
      try {
        await this.sessionApplicationService.revokeAllSessions(tenantCode, user.id);
      } catch (err) {
        throw new AuthStoreUnavailableError();
      }
    });

    // 11. Clear Redis temporary restricted setup key
    const redisKey = `auth:sso-setup:${flowId}`;
    try {
      const provider = this.redisCacheProvider as unknown as {
        client?: { del(key: string): Promise<number> };
      };
      const client = provider.client;
      if (!client) {
        throw new AuthStoreUnavailableError();
      }
      await client.del(redisKey);
    } catch (err) {
      if (err instanceof BusinessException) {
        throw err;
      }
      throw new AuthStoreUnavailableError();
    }

    // 12. Session transition
    return {
      mfaRequired: false,
      accessToken: 'mock-access-token-jwt',
      refreshToken: 'mock-refresh-token',
    };
  }
}
