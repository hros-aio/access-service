/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';

import { SecurityEventService } from './security-event.service';
import { AuthSecurityEventOutboxRepository } from '../repositories/auth-security-event-outbox.repository';

describe('SecurityEventService', () => {
  let service: SecurityEventService;
  let mockOutboxRepository: any;

  beforeEach(async () => {
    mockOutboxRepository = {
      create: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityEventService,
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = module.get<SecurityEventService>(SecurityEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('maskEmail', () => {
    it('should mask the local part of email, keeping domain visible', () => {
      expect(service.maskEmail('john.doe@example.com')).toBe('j***e@example.com');
      expect(service.maskEmail('ab@test.org')).toBe('***@test.org');
    });

    it('should return default mask for malformed emails', () => {
      expect(service.maskEmail('invalidemail')).toBe('***');
    });
  });

  describe('logLoginSucceeded', () => {
    it('should insert a login-succeeded event containing sanitized data', async () => {
      await service.logLoginSucceeded(
        'TENANT_123',
        'user-123',
        'session-123',
        '192.168.1.50',
        'Mozilla/5.0',
        true,
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.login-succeeded',
        publishStatus: 'pending',
        sanitizedPayload: {
          tenantCode: 'TENANT_123',
          userId: 'user-123',
          sessionId: 'session-123',
          authenticationMethod: 'PASSWORD',
          rememberMe: true,
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should use default userAgent and rememberMe when not provided', async () => {
      await service.logLoginSucceeded('TENANT_123', 'user-123', 'session-123', '192.168.1.50');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitizedPayload: expect.objectContaining({
            userAgent: 'unknown',
            rememberMe: false,
          }),
        }),
      );
    });
  });

  describe('logLoginFailed', () => {
    it('should mask attempted email and insert a login-failed event', async () => {
      await service.logLoginFailed(
        'TENANT_123',
        'secret_user@example.com',
        '192.168.1.50',
        'INVALID_CREDENTIALS',
        'user-123',
        'Mozilla/5.0',
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.login-failed',
        publishStatus: 'pending',
        sanitizedPayload: {
          tenantCode: 'TENANT_123',
          userId: 'user-123',
          attemptedEmail: 's***r@example.com',
          failureReason: 'INVALID_CREDENTIALS',
          authenticationMethod: 'PASSWORD',
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should insert event without password or credential hashes', async () => {
      const sensitivePassword = 'SecretPassword123!';
      await service.logLoginFailed(
        'TENANT_123',
        'user@example.com',
        '192.168.1.50',
        'INVALID_CREDENTIALS',
      );
      const arg = mockOutboxRepository.create.mock.calls[0][0];
      const payloadString = JSON.stringify(arg.sanitizedPayload);
      expect(payloadString).not.toContain(sensitivePassword);
      expect(payloadString).not.toContain('passwordHash');
    });

    it('should handle missing userId and userAgent', async () => {
      await service.logLoginFailed(
        'TENANT_123',
        'user@example.com',
        '192.168.1.50',
        'INVALID_CREDENTIALS',
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
          sanitizedPayload: expect.objectContaining({
            userId: null,
            userAgent: 'unknown',
          }),
        }),
      );
    });
  });

  describe('logAccountLocked', () => {
    it('should insert an account-locked event', async () => {
      await service.logAccountLocked('TENANT_123', 'user-123', '192.168.1.50', 'Mozilla/5.0');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.account-locked',
        publishStatus: 'pending',
        sanitizedPayload: {
          tenantCode: 'TENANT_123',
          userId: 'user-123',
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should use default userAgent when not provided', async () => {
      await service.logAccountLocked('TENANT_123', 'user-123', '192.168.1.50');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitizedPayload: expect.objectContaining({
            userAgent: 'unknown',
          }),
        }),
      );
    });
  });

  describe('logUserProvisioned', () => {
    it('should insert a user-provisioned event', async () => {
      await service.logUserProvisioned('TENANT_123', 'user-123', 'admin@tenant.com');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.user-provisioned',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          tenantCode: 'TENANT_123',
          email: 'admin@tenant.com',
          accountType: 'BUILT_IN_ADMIN',
          status: 'ACTIVE',
        },
      });
    });
  });

  describe('logSessionsRevoked', () => {
    it('should insert a sessions-revoked event', async () => {
      await service.logSessionsRevoked(
        'TENANT_123',
        'user-123',
        'EMPLOYMENT_STATUS_CHANGED',
        'DISABLED',
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.sessions-revoked',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          tenantCode: 'TENANT_123',
          reason: 'EMPLOYMENT_STATUS_CHANGED',
          newStatus: 'DISABLED',
        },
      });
    });
  });

  describe('logUserInvited', () => {
    it('should insert a user-invited event', async () => {
      await service.logUserInvited('TENANT_123', 'user-123', 'invite-123', 'user@tenant.com');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.user-invited',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          tenantCode: 'TENANT_123',
          invitationId: 'invite-123',
          email: 'user@tenant.com',
        },
      });
    });
  });

  describe('logInvitationAccepted', () => {
    it('should insert an invitation-accepted event', async () => {
      const acceptedAt = new Date('2026-09-13T12:00:00.000Z');
      await service.logInvitationAccepted(
        'TENANT_123',
        'user-123',
        'invite-123',
        acceptedAt.toISOString(),
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.invitation-accepted',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          tenantCode: 'TENANT_123',
          invitationId: 'invite-123',
          acceptedAt: acceptedAt.toISOString(),
        },
      });
    });

    it('should include supersededBy when provided', async () => {
      await service.logInvitationAccepted(
        'TENANT_123',
        'user-123',
        'invite-123',
        undefined,
        'SSO_SETUP',
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.invitation-accepted',
        publishStatus: 'pending',
        sanitizedPayload: expect.objectContaining({
          userId: 'user-123',
          tenantCode: 'TENANT_123',
          invitationId: 'invite-123',
          supersededBy: 'SSO_SETUP',
        }),
      });
    });
  });

  describe('logInvitationResent', () => {
    it('should insert an invitation-resent event', async () => {
      const expiresAt = new Date('2026-09-14T12:00:00.000Z');
      await service.logInvitationResent(
        'TENANT_123',
        'user-123',
        'invite-123',
        'user@tenant.com',
        expiresAt,
        'actor-123',
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.invitation-resent',
        publishStatus: 'pending',
        sanitizedPayload: {
          invitationId: 'invite-123',
          recipientEmail: 'user@tenant.com',
          expiresAt: expiresAt.toISOString(),
          resentByActorId: 'actor-123',
        },
      });
    });
  });

  describe('logPasswordResetRequested', () => {
    it('should insert a password-reset-requested event', async () => {
      await service.logPasswordResetRequested(
        'TENANT_123',
        'user-123',
        'user@example.com',
        'ch-123',
        false,
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.password-reset-requested',
        publishStatus: 'pending',
        sanitizedPayload: {
          tenantCode: 'TENANT_123',
          userId: 'user-123',
          deliveryEmail: 'user@example.com',
          challengeId: 'ch-123',
          initiatedByAdmin: false,
        },
      });
    });
  });

  describe('logPasswordResetCompleted', () => {
    it('should insert a password-reset-completed event', async () => {
      await service.logPasswordResetCompleted('TENANT_123', 'user-123', 'self_service');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.password-reset-completed',
        publishStatus: 'pending',
        sanitizedPayload: {
          tenantCode: 'TENANT_123',
          userId: 'user-123',
          resetMethod: 'self_service',
        },
      });
    });
  });

  describe('logPasswordChanged', () => {
    it('should insert a password-changed event with default actor', async () => {
      await service.logPasswordChanged('TENANT_123', 'user-123', 'SSO_FALLBACK_FIRST_TIME_SETUP');
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.password-changed',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          changeReason: 'SSO_FALLBACK_FIRST_TIME_SETUP',
          actor: {
            userId: 'user-123',
            type: 'USER',
          },
        },
      });
    });

    it('should insert a password-changed event with custom actor', async () => {
      await service.logPasswordChanged('TENANT_123', 'user-123', 'ADMIN_RESET', {
        userId: 'admin-1',
        type: 'ADMIN',
      });
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'TENANT_123',
        userId: 'user-123',
        eventType: 'authentication.password-changed',
        publishStatus: 'pending',
        sanitizedPayload: {
          userId: 'user-123',
          changeReason: 'ADMIN_RESET',
          actor: {
            userId: 'admin-1',
            type: 'ADMIN',
          },
        },
      });
    });
  });
});
