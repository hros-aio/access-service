/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { CryptoAdapter } from './crypto.adapter';
import { InvitationApplicationService } from './invitation.application.service';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { CredentialStatus, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../../auth/entities/credential.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from '../../auth/repositories/credential.repository';
import { CredentialDomainService } from '../../auth/services/credential.domain.service';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { Invitation } from '../entities/invitation.entity';
import {
  AuthInvitationInvalidError,
  AuthSessionStoreUnavailableError,
  CrossTenantAccessDeniedError,
  InvalidPasswordPolicyError,
  InvitationNotAllowedError,
} from '../exceptions/invitation.exception';
import { InvitationRepository } from '../repositories/invitation.repository';

describe('InvitationApplicationService', () => {
  let service: InvitationApplicationService;
  let mockTransactionService: any;
  let mockUserRepository: any;
  let mockInvitationRepository: any;
  let mockCredentialRepository: any;
  let mockAuthSecurityEventOutboxRepository: any;
  let mockCryptoAdapter: any;
  let mockCredentialDomainService: any;
  let mockRedisCacheProvider: any;
  let mockRedisClient: any;

  let mockTypeormUserRepository: any;
  let mockTypeormInvitationRepository: any;
  let mockTypeormCredentialRepository: any;
  let mockTypeormOutboxRepository: any;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockTypeormUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => u),
    };

    mockTypeormInvitationRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((i) => i),
    };

    mockTypeormCredentialRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => c),
    };

    mockTypeormOutboxRepository = {
      save: jest.fn().mockImplementation((o) => o),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) return mockTypeormUserRepository;
        if (entity === Invitation) return mockTypeormInvitationRepository;
        if (entity === Credential) return mockTypeormCredentialRepository;
        if (entity === AuthSecurityEventOutbox) return mockTypeormOutboxRepository;
        return null;
      }),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    mockUserRepository = {
      findById: jest
        .fn()
        .mockImplementation((id) => mockTypeormUserRepository.findOne({ where: { id } })),
      findByIdWithLock: jest
        .fn()
        .mockImplementation((id) => mockTypeormUserRepository.findOne({ where: { id } })),
      findOneWithOptions: jest
        .fn()
        .mockImplementation((opts) => mockTypeormUserRepository.findOne(opts)),
      findOne: jest.fn().mockImplementation((opts) => mockTypeormUserRepository.findOne(opts)),
      save: jest.fn().mockImplementation((u) => mockTypeormUserRepository.save(u)),
    };

    mockInvitationRepository = {
      findByTokenHash: jest
        .fn()
        .mockImplementation((tokenHash) =>
          mockTypeormInvitationRepository.findOne({ where: { tokenHash } }),
        ),
      findOne: jest
        .fn()
        .mockImplementation((opts) => mockTypeormInvitationRepository.findOne(opts)),
      save: jest.fn().mockImplementation((i) => mockTypeormInvitationRepository.save(i)),
    };

    mockCredentialRepository = {
      findActiveByUserId: jest
        .fn()
        .mockImplementation((userId) =>
          mockTypeormCredentialRepository.findOne({ where: { userId, status: 'active' } }),
        ),
      save: jest.fn().mockImplementation((c) => mockTypeormCredentialRepository.save(c)),
    };

    mockAuthSecurityEventOutboxRepository = {
      save: jest.fn().mockImplementation((o) => mockTypeormOutboxRepository.save(o)),
    };

    mockCryptoAdapter = {
      hashToken: jest.fn().mockImplementation((t) => `hashed-${t}`),
      generateToken: jest
        .fn()
        .mockReturnValue({ rawToken: 'raw-token', tokenHash: 'hashed-raw-token' }),
    };

    mockCredentialDomainService = {
      hashPassword: jest.fn().mockResolvedValue({ hash: 'hashed-password', algorithm: 'argon2id' }),
      verifyPassword: jest.fn(),
    };

    mockRedisClient = {
      smembers: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      get: jest.fn(),
    };

    mockRedisCacheProvider = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationApplicationService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: InvitationRepository, useValue: mockInvitationRepository },
        { provide: CredentialRepository, useValue: mockCredentialRepository },
        {
          provide: AuthSecurityEventOutboxRepository,
          useValue: mockAuthSecurityEventOutboxRepository,
        },
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: CryptoAdapter, useValue: mockCryptoAdapter },
        { provide: CredentialDomainService, useValue: mockCredentialDomainService },
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
      ],
    }).compile();

    service = module.get<InvitationApplicationService>(InvitationApplicationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateInvitation', () => {
    it('should validate a valid pending invitation', async () => {
      const invite = new Invitation();
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() + 100000);

      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-123';
      user.displayEmail = 'employee@tenant.com';

      mockInvitationRepository.findByTokenHash.mockResolvedValue(invite);
      mockTypeormUserRepository.findOne.mockResolvedValue(user);

      const result = await service.validateInvitation('token123');

      expect(result).toEqual({
        valid: true,
        userId: 'user-uuid',
        email: 'employee@tenant.com',
        tenantCode: 'tenant-123',
      });
      expect(mockCryptoAdapter.hashToken).toHaveBeenCalledWith('token123');
      expect(mockInvitationRepository.findByTokenHash).toHaveBeenCalledWith('hashed-token123');
    });

    it('should throw AuthInvitationInvalidError if invitation does not exist', async () => {
      mockInvitationRepository.findByTokenHash.mockResolvedValue(null);
      await expect(service.validateInvitation('invalid-token')).rejects.toThrow(
        AuthInvitationInvalidError,
      );
    });

    it('should throw AuthInvitationInvalidError if invitation is expired', async () => {
      const invite = new Invitation();
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() - 10000); // expired

      mockInvitationRepository.findByTokenHash.mockResolvedValue(invite);
      await expect(service.validateInvitation('expired-token')).rejects.toThrow(
        AuthInvitationInvalidError,
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should throw InvalidPasswordPolicyError if password violates policy', async () => {
      await expect(service.acceptInvitation({ token: 'tok', password: 'short' })).rejects.toThrow(
        InvalidPasswordPolicyError,
      );
    });

    it('should successfully accept and initialize credential', async () => {
      const invite = new Invitation();
      invite.id = 'invite-uuid';
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() + 100000);

      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-123';
      user.status = UserStatus.INVITED;
      user.credentialStatus = CredentialStatus.PENDING;
      user.securityVersion = 1;

      mockTypeormInvitationRepository.findOne.mockResolvedValue(invite);
      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);

      const result = await service.acceptInvitation({
        token: 'token123',
        password: 'ValidPassword123!',
      });

      expect(result).toEqual({ success: true, userId: 'user-uuid' });
      expect(invite.status).toBe(InvitationStatus.ACCEPTED);
      expect(invite.acceptedAt).toBeDefined();
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.securityVersion).toBe(2);
      expect(mockTypeormCredentialRepository.save).toHaveBeenCalled();
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.smembers).toHaveBeenCalled();
    });

    it('should successfully accept invitation even if user email was updated', async () => {
      const invite = new Invitation();
      invite.id = 'invite-uuid';
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() + 100000);

      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-123';
      user.status = UserStatus.INVITED;
      user.credentialStatus = CredentialStatus.PENDING;
      user.securityVersion = 1;
      user.displayEmail = 'new-email@tenant.com';
      user.normalizedEmail = 'new-email@tenant.com';

      mockTypeormInvitationRepository.findOne.mockResolvedValue(invite);
      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);

      const result = await service.acceptInvitation({
        token: 'token123',
        password: 'ValidPassword123!',
      });

      expect(result).toEqual({ success: true, userId: 'user-uuid' });
      expect(invite.status).toBe(InvitationStatus.ACCEPTED);
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('should successfully accept invitation and delete sessions and challenges from Redis', async () => {
      const invite = new Invitation();
      invite.id = 'invite-uuid';
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() + 100000);

      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-123';
      user.status = UserStatus.INVITED;
      user.credentialStatus = CredentialStatus.PENDING;
      user.securityVersion = 1;

      mockTypeormInvitationRepository.findOne.mockResolvedValue(invite);
      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);

      // Mock redis to return session ids and challenge keys
      mockRedisClient.smembers.mockResolvedValue(['session-1', 'session-2']);
      mockRedisClient.keys.mockResolvedValue(['auth:mfa-challenge:1', 'auth:mfa-challenge:2']);
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'auth:mfa-challenge:1') return 'user-uuid';
        return 'other-user-uuid';
      });

      const result = await service.acceptInvitation({
        token: 'token123',
        password: 'ValidPassword123!',
      });

      expect(result).toEqual({ success: true, userId: 'user-uuid' });
      expect(mockRedisClient.smembers).toHaveBeenCalledWith(
        GenerateUserSessionsKey('tenant-123', 'user-uuid'),
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        GenerateSessionKey('session-1'),
        GenerateSessionKey('session-2'),
        GenerateUserSessionsKey('tenant-123', 'user-uuid'),
      );
      expect(mockRedisClient.keys).toHaveBeenCalledWith('auth:mfa-challenge:*');
      expect(mockRedisClient.get).toHaveBeenCalledWith('auth:mfa-challenge:1');
      expect(mockRedisClient.get).toHaveBeenCalledWith('auth:mfa-challenge:2');
      expect(mockRedisClient.del).toHaveBeenCalledWith('auth:mfa-challenge:1');
    });

    it('should throw AuthSessionStoreUnavailableError if Redis fails during revocation', async () => {
      const invite = new Invitation();
      invite.id = 'invite-uuid';
      invite.userId = 'user-uuid';
      invite.status = InvitationStatus.PENDING;
      invite.expiresAt = new Date(Date.now() + 100000);

      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-123';
      user.status = UserStatus.INVITED;
      user.credentialStatus = CredentialStatus.PENDING;
      user.securityVersion = 1;

      mockTypeormInvitationRepository.findOne.mockResolvedValue(invite);
      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);

      // Force redis throw
      mockRedisClient.smembers.mockRejectedValue(new Error('Redis Down'));

      await expect(
        service.acceptInvitation({ token: 'token123', password: 'ValidPassword123!' }),
      ).rejects.toThrow(AuthSessionStoreUnavailableError);
    });
  });

  describe('resendInvitation', () => {
    it('should resend invitation for valid target user', async () => {
      const actor = { userId: 'admin-uuid', tenantCode: 'tenant-123', userType: 'admin' };
      const targetUser = new User();
      targetUser.id = 'target-user-uuid';
      targetUser.tenantCode = 'tenant-123';
      targetUser.displayEmail = 'employee@tenant.com';

      mockTypeormUserRepository.findOne.mockResolvedValue(targetUser);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null); // No credentials
      mockTypeormInvitationRepository.findOne.mockResolvedValue(null); // No old invitation

      const result = await service.resendInvitation(actor, 'target-user-uuid');

      expect(result.success).toBe(true);
      expect(result.rawToken).toBe('raw-token');
      expect(mockTypeormInvitationRepository.save).toHaveBeenCalled();
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalled();
    });

    it('should throw CrossTenantAccessDeniedError if user does not exist or tenant mismatch', async () => {
      const actor = { userId: 'admin-uuid', tenantCode: 'tenant-123', userType: 'admin' };
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      await expect(service.resendInvitation(actor, 'non-existent-user')).rejects.toThrow(
        CrossTenantAccessDeniedError,
      );
    });

    it('should throw InvitationNotAllowedError if active credential already exists', async () => {
      const actor = { userId: 'admin-uuid', tenantCode: 'tenant-123', userType: 'admin' };
      const targetUser = new User();
      targetUser.id = 'target-user-uuid';
      targetUser.tenantCode = 'tenant-123';

      const credential = new Credential();
      credential.userId = 'target-user-uuid';
      credential.status = 'active';

      mockTypeormUserRepository.findOne.mockResolvedValue(targetUser);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(credential);

      await expect(service.resendInvitation(actor, 'target-user-uuid')).rejects.toThrow(
        InvitationNotAllowedError,
      );
    });
  });
});
