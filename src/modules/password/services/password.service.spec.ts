/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { CredentialPolicy } from './credential.policy';
import { PasswordService } from './password.service';
import { UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../../auth/entities/credential.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from '../../auth/repositories/credential.repository';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { Invitation } from '../../invite/entities/invitation.entity';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { AuthenticationSettingsRepository } from '../../tenant/repositories/authentication-settings.repository';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { PasswordResetRedisAdapter } from '../adapters/password-reset-redis.adapter';
import {
  InvalidResetChallengeException,
  InvalidResetCodeException,
  MaxAttemptsExceededException,
  SelfServiceResetDisabledException,
} from '../exceptions/password-reset.exception';

describe('PasswordService', () => {
  let service: PasswordService;
  let mockTransactionService: any;
  let mockUserRepository: any;
  let mockCredentialRepository: any;
  let mockAuthSecurityEventOutboxRepository: any;
  let mockAuthenticationSettingsRepository: any;
  let mockCredentialDomainService: any;
  let mockRedisCacheProvider: any;
  let mockRedisClient: any;
  let mockSessionApplicationService: any;
  let mockInvitationRepository: any;
  let mockPasswordResetRedisAdapter: any;

  let mockTypeormUserRepository: any;
  let mockTypeormCredentialRepository: any;
  let mockTypeormInvitationRepository: any;
  let mockTypeormOutboxRepository: any;
  let mockTypeormSettingsRepository: any;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockTypeormUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => u),
    };

    mockTypeormCredentialRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => c),
    };

    mockTypeormInvitationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((i) => i),
    };

    mockTypeormOutboxRepository = {
      save: jest.fn().mockImplementation((o) => o),
    };

    mockTypeormSettingsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) return mockTypeormUserRepository;
        if (entity === Credential) return mockTypeormCredentialRepository;
        if (entity === Invitation) return mockTypeormInvitationRepository;
        if (entity === AuthSecurityEventOutbox) return mockTypeormOutboxRepository;
        if (entity === AuthenticationSettings) return mockTypeormSettingsRepository;
        return null;
      }),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    mockUserRepository = {
      findOne: jest
        .fn()
        .mockImplementation((opts) => mockTypeormUserRepository.findOne({ where: opts })),
      findOneWithOptions: jest
        .fn()
        .mockImplementation((opts) => mockTypeormUserRepository.findOne(opts)),
      save: jest.fn().mockImplementation((u) => mockTypeormUserRepository.save(u)),
    };

    mockCredentialRepository = {
      findOne: jest
        .fn()
        .mockImplementation((opts) => mockTypeormCredentialRepository.findOne(opts)),
      save: jest.fn().mockImplementation((c) => mockTypeormCredentialRepository.save(c)),
    };

    mockAuthSecurityEventOutboxRepository = {
      save: jest.fn().mockImplementation((o) => mockTypeormOutboxRepository.save(o)),
    };

    mockAuthenticationSettingsRepository = {
      findByTenantCode: jest
        .fn()
        .mockImplementation((tenantCode) =>
          mockTypeormSettingsRepository.findOne({ where: { tenant: { tenantCode } } }),
        ),
    };

    mockCredentialDomainService = {
      hashPassword: jest.fn().mockResolvedValue('hashed-password-123'),
    };

    mockRedisClient = {
      del: jest.fn().mockResolvedValue(1),
    };

    mockRedisCacheProvider = {
      client: mockRedisClient,
    };

    mockSessionApplicationService = {
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };

    mockInvitationRepository = {
      cancelPendingInvitations: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockImplementation((opts) => mockTypeormInvitationRepository.findOne(opts)),
    };

    mockPasswordResetRedisAdapter = {
      saveChallenge: jest.fn().mockResolvedValue(undefined),
      getChallenge: jest.fn(),
      incrementAttempts: jest.fn(),
      markCodeVerified: jest.fn().mockResolvedValue(undefined),
      deleteChallenge: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        CredentialPolicy,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: CredentialRepository, useValue: mockCredentialRepository },
        {
          provide: AuthSecurityEventOutboxRepository,
          useValue: mockAuthSecurityEventOutboxRepository,
        },
        {
          provide: AuthenticationSettingsRepository,
          useValue: mockAuthenticationSettingsRepository,
        },
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: CredentialDomainService, useValue: mockCredentialDomainService },
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        { provide: SessionApplicationService, useValue: mockSessionApplicationService },
        { provide: InvitationRepository, useValue: mockInvitationRepository },
        { provide: PasswordResetRedisAdapter, useValue: mockPasswordResetRedisAdapter },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestResetCode', () => {
    it('should throw SelfServiceResetDisabledException if tenant settings forbid self-service reset', async () => {
      mockTypeormSettingsRepository.findOne.mockResolvedValue({ needAdminResetPassword: true });

      await expect(
        service.requestResetCode({ tenantCode: 'tenant-1', email: 'user@example.com' }),
      ).rejects.toThrow(SelfServiceResetDisabledException);
    });

    it('should return generic success and skip redis/outbox if user is not found', async () => {
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      const res = await service.requestResetCode({
        tenantCode: 'tenant-1',
        email: 'missing@example.com',
      });
      expect(res.message).toContain('If an active account exists');
      expect(mockPasswordResetRedisAdapter.saveChallenge).not.toHaveBeenCalled();
    });

    it('should create challenge and save outbox event if valid user exists', async () => {
      const user = new User();
      user.id = 'user-uuid';
      user.displayEmail = 'user@example.com';
      user.normalizedEmail = 'user@example.com';
      user.tenantCode = 'tenant-1';
      user.status = UserStatus.ACTIVE;

      mockTypeormUserRepository.findOne.mockResolvedValue(user);

      const res = await service.requestResetCode({
        tenantCode: 'tenant-1',
        email: 'user@example.com',
      });
      expect(res.message).toContain('If an active account exists');
      expect(mockPasswordResetRedisAdapter.saveChallenge).toHaveBeenCalled();
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalled();
    });
  });

  describe('verifyResetCode', () => {
    it('should throw InvalidResetChallengeException if challenge is missing', async () => {
      mockPasswordResetRedisAdapter.getChallenge.mockResolvedValue(null);

      await expect(
        service.verifyResetCode({
          challengeId: 'ch-1',
          tenantCode: 'tenant-1',
          userId: 'u-1',
          code: '123456',
        }),
      ).rejects.toThrow(InvalidResetChallengeException);
    });

    it('should throw MaxAttemptsExceededException if attempts >= 3', async () => {
      mockPasswordResetRedisAdapter.getChallenge.mockResolvedValue({ attempts: 3 });

      await expect(
        service.verifyResetCode({
          challengeId: 'ch-1',
          tenantCode: 'tenant-1',
          userId: 'u-1',
          code: '123456',
        }),
      ).rejects.toThrow(MaxAttemptsExceededException);
    });

    it('should throw InvalidResetCodeException and increment attempts on code mismatch', async () => {
      mockPasswordResetRedisAdapter.getChallenge.mockResolvedValue({
        attempts: 0,
        hashedCode: 'different-hash',
      });
      mockPasswordResetRedisAdapter.incrementAttempts.mockResolvedValue(1);

      await expect(
        service.verifyResetCode({
          challengeId: 'ch-1',
          tenantCode: 'tenant-1',
          userId: 'u-1',
          code: '123456',
        }),
      ).rejects.toThrow(InvalidResetCodeException);
    });
  });

  describe('adminInitiateReset', () => {
    it('should initiate reset workflow for target user', async () => {
      const user = new User();
      user.id = 'user-target';
      user.displayEmail = 'target@example.com';
      user.normalizedEmail = 'target@example.com';
      user.tenantCode = 'tenant-1';
      user.status = UserStatus.ACTIVE;

      mockTypeormUserRepository.findOne.mockResolvedValue(user);

      const res = await service.adminInitiateReset({
        tenantCode: 'tenant-1',
        userId: 'user-target',
      });
      expect(res.message).toContain('Password reset workflow initiated');
      expect(mockPasswordResetRedisAdapter.saveChallenge).toHaveBeenCalled();
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalled();
    });
  });
});
