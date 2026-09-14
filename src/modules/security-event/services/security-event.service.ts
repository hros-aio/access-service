import { Injectable } from '@nestjs/common';

import { EventType } from '../../../enums';
import { AuthSecurityEventOutboxRepository } from '../repositories/auth-security-event-outbox.repository';

@Injectable()
export class SecurityEventService {
  constructor(private readonly outboxRepository: AuthSecurityEventOutboxRepository) {}

  maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) {
      return '***@' + domain;
    }
    return name.charAt(0) + '***' + name.charAt(name.length - 1) + '@' + domain;
  }

  async logLoginSucceeded(
    tenantCode: string,
    userId: string,
    sessionId: string,
    ipAddress: string,
    userAgent?: string,
    rememberMe = false,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId,
      sessionId,
      authenticationMethod: 'PASSWORD',
      rememberMe,
      ipAddress,
      userAgent: userAgent || 'unknown',
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: 'authentication.login-succeeded',
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logLoginFailed(
    tenantCode: string,
    attemptedEmail: string,
    ipAddress: string,
    failureReason: string,
    userId?: string,
    userAgent?: string,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId: userId || null,
      attemptedEmail: this.maskEmail(attemptedEmail),
      failureReason,
      authenticationMethod: 'PASSWORD',
      ipAddress,
      userAgent: userAgent || 'unknown',
    };

    await this.outboxRepository.create({
      tenantCode,
      userId: userId || undefined,
      eventType: 'authentication.login-failed',
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logAccountLocked(
    tenantCode: string,
    userId: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId,
      ipAddress,
      userAgent: userAgent || 'unknown',
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: 'authentication.account-locked',
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logSsoLoginSucceeded(
    tenantCode: string,
    userId: string,
    providerSubject: string,
    authState: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId,
      provider: 'firebase',
      providerSubject,
      authMethod: 'sso_firebase',
      authState,
      ipAddress,
      userAgent: userAgent || 'unknown',
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: 'authentication.sso-login-succeeded',
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logSsoLoginFailed(
    tenantCode: string,
    providerSubject: string,
    failureReason: string,
    ipAddress: string,
    userId?: string,
    userAgent?: string,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId: userId || null,
      provider: 'firebase',
      providerSubject,
      failureReason,
      ipAddress,
      userAgent: userAgent || 'unknown',
    };

    await this.outboxRepository.create({
      tenantCode,
      userId: userId || undefined,
      eventType: 'authentication.sso-login-failed',
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logUserProvisioned(
    tenantCode: string,
    userId: string,
    email: string,
    accountType = 'BUILT_IN_ADMIN',
    status = 'ACTIVE',
  ): Promise<void> {
    const payload = {
      userId,
      tenantCode,
      email,
      accountType,
      status,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_USER_PROVISIONED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logSessionsRevoked(
    tenantCode: string,
    userId: string,
    reason: string,
    newStatus: string,
  ): Promise<void> {
    const payload = {
      userId,
      tenantCode,
      reason,
      newStatus,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_SESSIONS_REVOKED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logUserInvited(
    tenantCode: string,
    userId: string,
    invitationId: string,
    email: string,
  ): Promise<void> {
    const payload = {
      userId,
      tenantCode,
      invitationId,
      email,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_USER_INVITED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logInvitationAccepted(
    tenantCode: string,
    userId: string,
    invitationId: string,
    acceptedAt?: string | Date,
    supersededBy?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      userId,
      tenantCode,
      invitationId,
      acceptedAt:
        acceptedAt instanceof Date
          ? acceptedAt.toISOString()
          : (acceptedAt ?? new Date().toISOString()),
    };

    if (supersededBy) {
      payload.supersededBy = supersededBy;
    }

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_INVITATION_ACCEPTED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logInvitationResent(
    tenantCode: string,
    userId: string,
    invitationId: string,
    recipientEmail: string,
    expiresAt: string | Date,
    resentByActorId: string,
  ): Promise<void> {
    const payload = {
      invitationId,
      recipientEmail,
      expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      resentByActorId,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_INVITATION_RESENT,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logPasswordResetRequested(
    tenantCode: string,
    userId: string,
    deliveryEmail: string,
    challengeId: string,
    initiatedByAdmin = false,
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId,
      deliveryEmail,
      challengeId,
      initiatedByAdmin,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_PASSWORD_RESET_REQUESTED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logPasswordResetCompleted(
    tenantCode: string,
    userId: string,
    resetMethod = 'self_service',
  ): Promise<void> {
    const payload = {
      tenantCode,
      userId,
      resetMethod,
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_PASSWORD_RESET_COMPLETED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }

  async logPasswordChanged(
    tenantCode: string,
    userId: string,
    changeReason: string,
    actor?: { userId: string; type: string },
  ): Promise<void> {
    const payload = {
      userId,
      changeReason,
      actor: actor ?? {
        userId,
        type: 'USER',
      },
    };

    await this.outboxRepository.create({
      tenantCode,
      userId,
      eventType: EventType.AUTHENTICATION_PASSWORD_CHANGED,
      sanitizedPayload: payload,
      publishStatus: 'pending',
    });
  }
}
