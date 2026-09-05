import { FirebaseAdminAdapter, FirebaseVerificationError } from './firebase-admin.adapter';
import {
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '../../domain/exceptions/firebase-sso.exceptions';

interface GlobalWithAdmin {
  admin?: {
    auth?: () => {
      verifyIdToken: (token: string) => Promise<Record<string, unknown>>;
    };
  };
}

describe('FirebaseAdminAdapter', () => {
  let adapter: FirebaseAdminAdapter;

  beforeEach(() => {
    adapter = new FirebaseAdminAdapter();
    delete (global as unknown as GlobalWithAdmin).admin;
  });

  it('should verify valid token in fallback mock mode', async () => {
    const result = await adapter.verifyIdToken('VALID_TOKEN');
    expect(result.uid).toBe('fb_uid_998877');
    expect(result.email).toBe('sso.user@company.com');
  });

  it('should throw FirebaseProviderUnavailableException on mock timeout token', async () => {
    await expect(adapter.verifyIdToken('MOCK_TIMEOUT_TOKEN')).rejects.toThrow(
      FirebaseProviderUnavailableException,
    );
  });

  it('should throw InvalidFirebaseTokenException on mock invalid token', async () => {
    await expect(adapter.verifyIdToken('INVALID_TOKEN')).rejects.toThrow(
      InvalidFirebaseTokenException,
    );
  });

  it('should verify token when global.admin.auth is available', async () => {
    (global as unknown as GlobalWithAdmin).admin = {
      auth: (): { verifyIdToken: (token: string) => Promise<Record<string, unknown>> } => ({
        verifyIdToken: jest.fn().mockResolvedValue({
          uid: 'global_fb_uid',
          email: 'global@company.com',
          email_verified: true,
          firebase: { tenant: 'TENANT_GLOBAL' },
        }),
      }),
    };

    const result = await adapter.verifyIdToken('ANY_TOKEN');
    expect(result.uid).toBe('global_fb_uid');
    expect(result.tenant_code).toBe('TENANT_GLOBAL');
  });

  it('should handle auth/ error code and rethrow InvalidFirebaseTokenException', async () => {
    const customError = new FirebaseVerificationError('Token verification failed');
    customError.code = 'auth/invalid-id-token';

    (global as unknown as GlobalWithAdmin).admin = {
      auth: (): { verifyIdToken: (token: string) => Promise<Record<string, unknown>> } => ({
        verifyIdToken: jest.fn().mockRejectedValue(customError),
      }),
    };

    await expect(adapter.verifyIdToken('ANY_TOKEN')).rejects.toThrow(InvalidFirebaseTokenException);
  });

  it('should handle generic error and rethrow FirebaseProviderUnavailableException', async () => {
    (global as unknown as GlobalWithAdmin).admin = {
      auth: (): { verifyIdToken: (token: string) => Promise<Record<string, unknown>> } => ({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Network error')),
      }),
    };

    await expect(adapter.verifyIdToken('ANY_TOKEN')).rejects.toThrow(
      FirebaseProviderUnavailableException,
    );
  });
});
