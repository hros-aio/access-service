/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { CredentialPolicy } from './credential.policy';
import { PasswordService } from './password.service';
import { CredentialStatus, UserStatus } from '../../../enums';
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

describe('PasswordService', () => {
  let service: PasswordService;
  let mockTransactionService: any;
  let mockCredentialDomainService: any;
  let mockRedisCacheProvider: any;
  let mockRedisClient: any;
  let mockSessionApplicationService: any;
  let mockInvitationRepository: any;

  let mockTypeormUserRepository: any;
  let mockTypeormCredentialRepository: any;
  let mockTypeormInvitationRepository: any;
  let mockTypeormOutboxRepository: any;
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

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) return mockTypeormUserRepository;
        if (entity === Credential) return mockTypeormCredentialRepository;
        if (entity === Invitation) return mockTypeormInvitationRepository;
        if (entity === AuthSecurityEventOutbox) return mockTypeormOutboxRepository;
        return null;
      }),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue(mockEntityManager),
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        CredentialPolicy,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: CredentialDomainService, useValue: mockCredentialDomainService },
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        { provide: SessionApplicationService, useValue: mockSessionApplicationService },
        { provide: InvitationRepository, useValue: mockInvitationRepository },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setupPasswordViaSsoFallback', () => {
    it('should successfully set password, update state, cancel pending invitations, delete Redis token, and return tokens', async () => {
      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-abc';
      user.status = UserStatus.INVITED;
      user.credentialStatus = CredentialStatus.PENDING;
      user.securityVersion = 1;

      const pendingInvite = new Invitation();
      pendingInvite.id = 'invite-uuid';

      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);
      mockTypeormInvitationRepository.findOne.mockResolvedValue(pendingInvite);

      const result = await service.setupPasswordViaSsoFallback(
        'flow-123',
        'tenant-abc',
        'user-uuid',
        { password: 'Password123!' },
      );

      expect(result).toEqual({
        mfaRequired: false,
        accessToken: 'mock-access-token-jwt',
        refreshToken: 'mock-refresh-token',
      });

      // Verify db changes saved
      expect(mockTypeormUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid', tenantCode: 'tenant-abc' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockTypeormCredentialRepository.save).toHaveBeenCalled();
      expect(mockTypeormUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserStatus.ACTIVE,
          credentialStatus: CredentialStatus.ACTIVE,
          securityVersion: 2,
        }),
      );
      expect(mockInvitationRepository.cancelPendingInvitations).toHaveBeenCalledWith(
        'tenant-abc',
        'user-uuid',
      );
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalledTimes(2); // US1 password event + US2 invitation accepted/superseded event
      expect(mockSessionApplicationService.revokeAllSessions).toHaveBeenCalledWith(
        'tenant-abc',
        'user-uuid',
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith('auth:sso-setup:flow-123');
    });

    it('should throw InvalidPasswordPolicyError if password is weak', async () => {
      await expect(
        service.setupPasswordViaSsoFallback('flow-123', 'tenant-abc', 'user-uuid', {
          password: '123',
        }),
      ).rejects.toThrow(InvalidPasswordPolicyError);
    });

    it('should throw AuthSessionExpiredError if user row cannot be locked or found', async () => {
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.setupPasswordViaSsoFallback('flow-123', 'tenant-abc', 'user-uuid', {
          password: 'Password123!',
        }),
      ).rejects.toThrow(AuthSessionExpiredError);
    });

    it('should throw CredentialAlreadyExistsError if user already has an active password credential', async () => {
      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-abc';

      const existingCred = new Credential();
      existingCred.userId = 'user-uuid';
      existingCred.status = 'active';

      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(existingCred);

      await expect(
        service.setupPasswordViaSsoFallback('flow-123', 'tenant-abc', 'user-uuid', {
          password: 'Password123!',
        }),
      ).rejects.toThrow(CredentialAlreadyExistsError);
    });

    it('should throw AuthStoreUnavailableError if Redis client is missing or fails', async () => {
      const user = new User();
      user.id = 'user-uuid';
      user.tenantCode = 'tenant-abc';

      mockTypeormUserRepository.findOne.mockResolvedValue(user);
      mockTypeormCredentialRepository.findOne.mockResolvedValue(null);

      // Force delete to reject
      mockRedisClient.del.mockRejectedValue(new Error('Redis issue'));

      await expect(
        service.setupPasswordViaSsoFallback('flow-123', 'tenant-abc', 'user-uuid', {
          password: 'Password123!',
        }),
      ).rejects.toThrow(AuthStoreUnavailableError);
    });
  });
});
