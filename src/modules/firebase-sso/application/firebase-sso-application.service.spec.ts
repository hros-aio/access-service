import { FirebaseSsoApplicationService } from './firebase-sso-application.service';
import { ExternalIdentity } from '../../auth/entities/external-identity.entity';
import { ExternalIdentityRepository } from '../../auth/repositories/external-identity.repository';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
} from '../domain/exceptions/firebase-sso.exceptions';
import { FirebaseVerifierPort } from '../domain/ports/firebase-verifier.port';

describe('FirebaseSsoApplicationService', () => {
  let firebaseVerifier: jest.Mocked<FirebaseVerifierPort>;
  let externalIdentityRepository: jest.Mocked<ExternalIdentityRepository>;
  let securityEventService: jest.Mocked<SecurityEventService>;
  let service: FirebaseSsoApplicationService;

  beforeEach(() => {
    firebaseVerifier = { verifyIdToken: jest.fn() };
    externalIdentityRepository = {
      findMapping: jest.fn(),
    } as unknown as jest.Mocked<ExternalIdentityRepository>;
    securityEventService = {
      logSsoLoginSucceeded: jest.fn(),
      logSsoLoginFailed: jest.fn(),
    } as unknown as jest.Mocked<SecurityEventService>;
    service = new FirebaseSsoApplicationService(
      firebaseVerifier,
      externalIdentityRepository,
      securityEventService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw ExternalIdentityNotMappedException when mapping is missing', async () => {
    firebaseVerifier.verifyIdToken.mockResolvedValue({ uid: 'fb_uid_123' });
    externalIdentityRepository.findMapping.mockResolvedValue([]);

    await expect(
      service.authenticateSso({ tenantCode: 'TENANT_01', idToken: 'valid_token' }),
    ).rejects.toThrow(ExternalIdentityNotMappedException);

    expect(securityEventService.logSsoLoginFailed).toHaveBeenCalledWith(
      'TENANT_01',
      'fb_uid_123',
      'UNMAPPED_EXTERNAL_IDENTITY',
      '127.0.0.1',
      undefined,
      'unknown',
    );
  });

  it('should throw AmbiguousIdentityMappingException when multiple mappings exist', async () => {
    firebaseVerifier.verifyIdToken.mockResolvedValue({ uid: 'fb_uid_dup' });
    externalIdentityRepository.findMapping.mockResolvedValue([
      { userId: 'u1' } as ExternalIdentity,
      { userId: 'u2' } as ExternalIdentity,
    ]);

    await expect(
      service.authenticateSso({ tenantCode: 'TENANT_01', idToken: 'valid_token' }),
    ).rejects.toThrow(AmbiguousIdentityMappingException);

    expect(securityEventService.logSsoLoginFailed).toHaveBeenCalledWith(
      'TENANT_01',
      'fb_uid_dup',
      'IDENTITY_AMBIGUITY_CONFLICT',
      '127.0.0.1',
      undefined,
      'unknown',
    );
  });

  it('should return ACTIVE result and log success event when single mapping exists', async () => {
    firebaseVerifier.verifyIdToken.mockResolvedValue({ uid: 'fb_uid_ok' });
    externalIdentityRepository.findMapping.mockResolvedValue([
      { userId: 'u_active' } as ExternalIdentity,
    ]);

    const result = await service.authenticateSso({
      tenantCode: 'TENANT_01',
      idToken: 'valid_token',
    });

    expect(result).toEqual({
      authState: 'ACTIVE',
      accessToken: 'mock_sso_access_token',
      refreshToken: 'mock_sso_refresh_token',
      expiresIn: 900,
    });
    expect(securityEventService.logSsoLoginSucceeded).toHaveBeenCalledWith(
      'TENANT_01',
      'u_active',
      'fb_uid_ok',
      'ACTIVE',
      '127.0.0.1',
      'unknown',
    );
  });
});
