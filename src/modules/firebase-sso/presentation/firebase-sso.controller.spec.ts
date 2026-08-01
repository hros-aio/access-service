import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { FirebaseSsoController } from './firebase-sso.controller';
import { FirebaseSsoApplicationService } from '../application/firebase-sso-application.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '../domain/exceptions/firebase-sso.exceptions';

describe('FirebaseSsoController', () => {
  let controller: FirebaseSsoController;
  let service: jest.Mocked<FirebaseSsoApplicationService>;

  beforeEach(() => {
    service = {
      authenticateSso: jest.fn(),
    } as unknown as jest.Mocked<FirebaseSsoApplicationService>;
    controller = new FirebaseSsoController(service);
  });

  it('should return SUCCESS status and authentication payload on success', async () => {
    const mockAuthResult = {
      authState: 'ACTIVE' as const,
      accessToken: 'token_123',
      refreshToken: 'refresh_123',
      expiresIn: 900,
    };
    service.authenticateSso.mockResolvedValue(mockAuthResult);

    const res = await controller.loginWithFirebase({
      tenantCode: 'TENANT_01',
      idToken: 'valid_id_token',
    });

    expect(res).toEqual({
      status: 'SUCCESS',
      data: mockAuthResult,
    });
  });

  it('should throw UnauthorizedException on InvalidFirebaseTokenException', async () => {
    service.authenticateSso.mockRejectedValue(new InvalidFirebaseTokenException());

    await expect(
      controller.loginWithFirebase({ tenantCode: 'TENANT_01', idToken: 'invalid_token' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException on ExternalIdentityNotMappedException', async () => {
    service.authenticateSso.mockRejectedValue(new ExternalIdentityNotMappedException());

    await expect(
      controller.loginWithFirebase({ tenantCode: 'TENANT_01', idToken: 'unmapped_token' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw ConflictException on AmbiguousIdentityMappingException', async () => {
    service.authenticateSso.mockRejectedValue(new AmbiguousIdentityMappingException());

    await expect(
      controller.loginWithFirebase({ tenantCode: 'TENANT_01', idToken: 'ambiguous_token' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ServiceUnavailableException on FirebaseProviderUnavailableException', async () => {
    service.authenticateSso.mockRejectedValue(new FirebaseProviderUnavailableException());

    await expect(
      controller.loginWithFirebase({ tenantCode: 'TENANT_01', idToken: 'timeout_token' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should rethrow unknown exceptions', async () => {
    const error = new Error('Database connection failed');
    service.authenticateSso.mockRejectedValue(error);

    await expect(
      controller.loginWithFirebase({ tenantCode: 'TENANT_01', idToken: 'token' }),
    ).rejects.toThrow(error);
  });
});
