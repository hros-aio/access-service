import { Injectable } from '@nestjs/common';

import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';

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
}
