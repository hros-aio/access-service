/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';

import { SecurityEventService } from './security-event.service';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';

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
          rememberMe: false,
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0',
        },
      });
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
  });
});
