/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationService, RedisCacheProvider } from '@new-hros/libs-core';
import * as jwt from 'jsonwebtoken';

import { AuthApplicationService } from './auth.application.service';
import { CredentialDomainService } from './credential.domain.service';
import { CredentialStatus, UserStatus } from '../../../enums';
import { IpRestrictionService } from '../../ip-restriction/services/ip-restriction.service';
import { LockoutService } from '../../lockout/services/lockout.service';
import { MfaMethodRepository } from '../../mfa/repositories/mfa-method.repository';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettingsRepository } from '../../tenant/repositories/authentication-settings.repository';
import { TenantRepository } from '../../tenant/repositories/tenant.repository';
import { UserRepository } from '../../user/repositories/user.repository';
import {
  AccountDisabledError,
  AccountLockedError,
  InvalidCredentialsError,
} from '../exceptions/auth.exception';
import { CredentialRepository } from '../repositories/credential.repository';

import { FirebaseSsoApplicationService } from '@/modules/firebase-sso/application/firebase-sso-application.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '@/modules/firebase-sso/domain/exceptions/firebase-sso.exceptions';

jest.mock('jsonwebtoken');

describe('AuthApplicationService', () => {
  let service: AuthApplicationService;
  let mockUserRepository: any;
  let mockCredentialRepository: any;
  let mockCredentialDomainService: any;
  let mockTenantRepository: any;
  let mockAuthenticationSettingsRepository: any;
  let mockMfaMethodRepository: any;
  let mockIpRestrictionService: any;
  let mockLockoutService: any;
  let mockSecurityEventService: any;
  let mockRedisCacheProvider: any;
  let mockConfigService: any;
  let mockFirebaseSsoApplicationService: any;

  const mockUser = {
    id: 'user-uuid',
    tenantCode: 'TENANT_123',
    normalizedEmail: 'employee@tenant.com',
    displayEmail: 'employee@tenant.com',
    status: UserStatus.ACTIVE,
    securityVersion: 1,
  };

  const mockCredential = {
    id: 'cred-uuid',
    userId: 'user-uuid',
    passwordHash: 'hashed-pwd',
    algorithm: 'argon2id',
    status: CredentialStatus.ACTIVE,
  };

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
    };
    mockCredentialRepository = {
      findActiveByUserId: jest.fn(),
    };
    mockCredentialDomainService = {
      verifyPassword: jest.fn(),
    };
    mockTenantRepository = {
      exists: jest.fn().mockResolvedValue(true),
    };
    mockAuthenticationSettingsRepository = {
      findByTenantCode: jest.fn().mockResolvedValue({
        restrictedMfaEnabled: false,
      }),
    };
    mockMfaMethodRepository = {
      findActiveByUserId: jest.fn().mockResolvedValue([]),
    };
    mockIpRestrictionService = {
      evaluate: jest.fn(),
    };
    mockLockoutService = {
      handleFailure: jest.fn().mockResolvedValue(false),
      resetFailureCount: jest.fn(),
    };
    mockSecurityEventService = {
      logLoginSucceeded: jest.fn(),
      logLoginFailed: jest.fn(),
      logAccountLocked: jest.fn(),
    };
    mockRedisCacheProvider = {
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue({
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      }),
    };
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt.privateKey') return 'dummy-private-key';
        return undefined;
      }),
    };

    mockFirebaseSsoApplicationService = {
      authenticateSso: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthApplicationService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: CredentialRepository, useValue: mockCredentialRepository },
        { provide: CredentialDomainService, useValue: mockCredentialDomainService },
        { provide: TenantRepository, useValue: mockTenantRepository },
        {
          provide: AuthenticationSettingsRepository,
          useValue: mockAuthenticationSettingsRepository,
        },
        { provide: MfaMethodRepository, useValue: mockMfaMethodRepository },
        { provide: IpRestrictionService, useValue: mockIpRestrictionService },
        { provide: LockoutService, useValue: mockLockoutService },
        { provide: SecurityEventService, useValue: mockSecurityEventService },
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        { provide: ConfigurationService, useValue: mockConfigService },
        {
          provide: FirebaseSsoApplicationService,
          useValue: mockFirebaseSsoApplicationService,
        },
      ],
    }).compile();

    service = module.get<AuthApplicationService>(AuthApplicationService);

    // Reset the module-level jwt mock before each test
    (jwt.sign as jest.Mock).mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loginWithPassword', () => {
    it('should successfully authenticate user and return tokens', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockCredentialRepository.findActiveByUserId.mockResolvedValue(mockCredential);
      mockCredentialDomainService.verifyPassword.mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await service.loginWithPassword({
        tenantCode: 'TENANT_123',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
        rememberMe: true,
      });

      expect(result.authState).toBe('AUTHENTICATED');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
      expect(mockRedisCacheProvider.set).toHaveBeenCalled();
      expect(mockRedisCacheProvider.getClient().sadd).toHaveBeenCalled();
    });

    it('should throw InvalidCredentialsError for non-existent tenant', async () => {
      mockTenantRepository.exists.mockResolvedValue(false);

      await expect(
        service.loginWithPassword({
          tenantCode: 'TENANT_XYZ',
          email: 'employee@tenant.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('should throw InvalidCredentialsError for non-existent user email', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.loginWithPassword({
          tenantCode: 'TENANT_123',
          email: 'nonexistent@tenant.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('should throw AccountDisabledError for suspended user', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        service.loginWithPassword({
          tenantCode: 'TENANT_123',
          email: 'employee@tenant.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(AccountDisabledError);
    });

    it('should throw AccountLockedError for locked user', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        status: UserStatus.LOCKED,
      });

      await expect(
        service.loginWithPassword({
          tenantCode: 'TENANT_123',
          email: 'employee@tenant.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(AccountLockedError);
    });

    it('should throw InvalidCredentialsError for wrong password', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockCredentialRepository.findActiveByUserId.mockResolvedValue(mockCredential);
      mockCredentialDomainService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.loginWithPassword({
          tenantCode: 'TENANT_123',
          email: 'employee@tenant.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('should return MFA_REQUIRED and a challengeId if user has active enrolled MFA methods', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockCredentialRepository.findActiveByUserId.mockResolvedValue(mockCredential);
      mockCredentialDomainService.verifyPassword.mockResolvedValue(true);
      mockMfaMethodRepository.findActiveByUserId.mockResolvedValue([
        { id: 'mfa-uuid', type: 'sms', status: 'active' },
      ]);
      mockAuthenticationSettingsRepository.findByTenantCode.mockResolvedValue({
        restrictedMfaEnabled: false,
      });

      const result = await service.loginWithPassword({
        tenantCode: 'TENANT_123',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      });

      expect(result.authState).toBe('MFA_REQUIRED');
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(mockRedisCacheProvider.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:mfa-challenge:/),
        expect.objectContaining({
          userId: 'user-uuid',
          tenantCode: 'TENANT_123',
        }),
        300,
      );
    });

    it('should return MFA_REQUIRED and a challengeId if tenant has mandatory MFA enabled', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockCredentialRepository.findActiveByUserId.mockResolvedValue(mockCredential);
      mockCredentialDomainService.verifyPassword.mockResolvedValue(true);
      mockMfaMethodRepository.findActiveByUserId.mockResolvedValue([]);
      mockAuthenticationSettingsRepository.findByTenantCode.mockResolvedValue({
        restrictedMfaEnabled: true,
      });

      const result = await service.loginWithPassword({
        tenantCode: 'TENANT_123',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      });

      expect(result.authState).toBe('MFA_REQUIRED');
      expect(mockRedisCacheProvider.set).toHaveBeenCalled();
    });

    it('should return MFA_REQUIRED and a challengeId if user requires MFA enrollment', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        mfaEnrollmentRequired: true,
      });
      mockCredentialRepository.findActiveByUserId.mockResolvedValue(mockCredential);
      mockCredentialDomainService.verifyPassword.mockResolvedValue(true);
      mockMfaMethodRepository.findActiveByUserId.mockResolvedValue([]);
      mockAuthenticationSettingsRepository.findByTenantCode.mockResolvedValue({
        restrictedMfaEnabled: false,
      });

      const result = await service.loginWithPassword({
        tenantCode: 'TENANT_123',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      });

      expect(result.authState).toBe('MFA_REQUIRED');
      expect(mockRedisCacheProvider.set).toHaveBeenCalled();
    });
  });

  describe('loginWithFirebase', () => {
    const firebaseDto = {
      tenantCode: 'TENANT_123',
      idToken: 'valid-firebase-token',
    };

    it('should successfully authenticate via SSO and return tokens', async () => {
      mockFirebaseSsoApplicationService.authenticateSso.mockResolvedValue(mockUser);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await service.loginWithFirebase(firebaseDto);

      expect(mockFirebaseSsoApplicationService.authenticateSso).toHaveBeenCalledWith(
        firebaseDto,
        'unknown',
        'unknown',
      );
      expect(result.authState).toBe('AUTHENTICATED');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
      expect(mockRedisCacheProvider.set).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is invalid or expired', async () => {
      mockFirebaseSsoApplicationService.authenticateSso.mockRejectedValue(
        new InvalidFirebaseTokenException(),
      );

      await expect(service.loginWithFirebase(firebaseDto)).rejects.toThrow(
        'Authentication failed via Single Sign-On. Please try again or contact your administrator.',
      );
    });

    it('should throw UnauthorizedException when external identity is not mapped', async () => {
      mockFirebaseSsoApplicationService.authenticateSso.mockRejectedValue(
        new ExternalIdentityNotMappedException(),
      );

      await expect(service.loginWithFirebase(firebaseDto)).rejects.toThrow(
        'Authentication failed via Single Sign-On. Please try again or contact your administrator.',
      );
    });

    it('should throw ConflictException when identity mapping is ambiguous', async () => {
      mockFirebaseSsoApplicationService.authenticateSso.mockRejectedValue(
        new AmbiguousIdentityMappingException(),
      );

      await expect(service.loginWithFirebase(firebaseDto)).rejects.toThrow(
        'Authentication failed due to ambiguous identity mappings. Please contact your administrator.',
      );
    });

    it('should throw ServiceUnavailableException when Firebase provider is unavailable', async () => {
      mockFirebaseSsoApplicationService.authenticateSso.mockRejectedValue(
        new FirebaseProviderUnavailableException(),
      );

      await expect(service.loginWithFirebase(firebaseDto)).rejects.toThrow(
        'Single Sign-On service is temporarily unavailable. Please try logging in with your password.',
      );
    });
  });
});
