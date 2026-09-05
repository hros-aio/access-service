import { Test, TestingModule } from '@nestjs/testing';

import { FirebaseSsoApplicationService } from './firebase-sso-application.service';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
} from '../domain/exceptions/firebase-sso.exceptions';
import {
  FIREBASE_VERIFIER_PORT,
  FirebaseVerifierPort,
} from '../domain/ports/firebase-verifier.port';

import { User } from '@/modules/user/entities/user.entity';
import { UserRepository } from '@/modules/user/repositories/user.repository';

describe('FirebaseSsoApplicationService', () => {
  let firebaseVerifier: jest.Mocked<FirebaseVerifierPort>;
  let userRepo: jest.Mocked<UserRepository>;
  let securityEventService: jest.Mocked<SecurityEventService>;
  let service: FirebaseSsoApplicationService;

  beforeEach(async () => {
    firebaseVerifier = {
      verifyIdToken: jest.fn(),
    };

    userRepo = {
      findByTenantAndExternalIdentity: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    securityEventService = {
      logSsoLoginSucceeded: jest.fn(),
      logSsoLoginFailed: jest.fn(),
    } as unknown as jest.Mocked<SecurityEventService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseSsoApplicationService,
        { provide: FIREBASE_VERIFIER_PORT, useValue: firebaseVerifier },
        { provide: UserRepository, useValue: userRepo },
        { provide: SecurityEventService, useValue: securityEventService },
      ],
    }).compile();

    service = module.get<FirebaseSsoApplicationService>(FirebaseSsoApplicationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('authenticateSso', () => {
    it('should throw ExternalIdentityNotMappedException when user mapping is missing', async () => {
      firebaseVerifier.verifyIdToken.mockResolvedValue({
        uid: 'fb_uid_123',
        email: 'user@tenant.com',
      });
      userRepo.findByTenantAndExternalIdentity.mockResolvedValue(null);

      await expect(
        service.authenticateSso({ tenantCode: 'TENANT_01', idToken: 'valid_token' }),
      ).rejects.toThrow(ExternalIdentityNotMappedException);

      expect(userRepo.findByTenantAndExternalIdentity).toHaveBeenCalledWith(
        'TENANT_01',
        'fb_uid_123',
      );
      expect(securityEventService.logSsoLoginFailed).toHaveBeenCalledWith(
        'TENANT_01',
        'fb_uid_123',
        'UNMAPPED_EXTERNAL_IDENTITY',
        '127.0.0.1',
        undefined,
        'unknown',
      );
    });

    it('should throw ExternalIdentityNotMappedException when user email does not match token email', async () => {
      firebaseVerifier.verifyIdToken.mockResolvedValue({
        uid: 'fb_uid_123',
        email: 'token_email@tenant.com',
      });
      userRepo.findByTenantAndExternalIdentity.mockResolvedValue({
        id: 'user_1',
        normalizedEmail: 'different_email@tenant.com',
      } as User);

      await expect(
        service.authenticateSso(
          { tenantCode: 'TENANT_01', idToken: 'valid_token' },
          '192.168.1.1',
          'custom-agent',
        ),
      ).rejects.toThrow(ExternalIdentityNotMappedException);

      expect(securityEventService.logSsoLoginFailed).toHaveBeenCalledWith(
        'TENANT_01',
        'fb_uid_123',
        'UNMAPPED_EXTERNAL_IDENTITY',
        '192.168.1.1',
        undefined,
        'custom-agent',
      );
    });

    it('should throw AmbiguousIdentityMappingException when token tenant_code mismatches dto tenantCode', async () => {
      firebaseVerifier.verifyIdToken.mockResolvedValue({
        uid: 'fb_uid_123',
        email: 'user@tenant.com',
        tenant_code: 'OTHER_TENANT',
      });
      userRepo.findByTenantAndExternalIdentity.mockResolvedValue({
        id: 'user_1',
        normalizedEmail: 'user@tenant.com',
      } as User);

      await expect(
        service.authenticateSso(
          { tenantCode: 'TENANT_01', idToken: 'valid_token' },
          '192.168.1.1',
          'custom-agent',
        ),
      ).rejects.toThrow(AmbiguousIdentityMappingException);

      expect(securityEventService.logSsoLoginFailed).toHaveBeenCalledWith(
        'TENANT_01',
        'fb_uid_123',
        'IDENTITY_AMBIGUITY_CONFLICT',
        '192.168.1.1',
        undefined,
        'custom-agent',
      );
    });

    it('should return authenticated user and log success event when mapping and tenant match', async () => {
      const mockUser = {
        id: 'user_123',
        tenantCode: 'TENANT_01',
        normalizedEmail: 'user@tenant.com',
      } as User;

      firebaseVerifier.verifyIdToken.mockResolvedValue({
        uid: 'fb_uid_123',
        email: 'user@tenant.com',
        tenant_code: 'TENANT_01',
      });
      userRepo.findByTenantAndExternalIdentity.mockResolvedValue(mockUser);

      const result = await service.authenticateSso(
        {
          tenantCode: 'TENANT_01',
          idToken: 'valid_token',
        },
        '10.0.0.1',
        'test-browser',
      );

      expect(result).toBe(mockUser);
      expect(securityEventService.logSsoLoginSucceeded).toHaveBeenCalledWith(
        'TENANT_01',
        'user_123',
        'fb_uid_123',
        'ACTIVE',
        '10.0.0.1',
        'test-browser',
      );
    });
  });
});
