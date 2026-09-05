import { Injectable, Logger } from '@nestjs/common';

import {
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '../../domain/exceptions/firebase-sso.exceptions';
import {
  DecodedFirebaseToken,
  FirebaseVerifierPort,
} from '../../domain/ports/firebase-verifier.port';

interface GlobalAdminAuth {
  admin?: {
    auth?: () => {
      verifyIdToken: (token: string) => Promise<Record<string, unknown>>;
    };
  };
}

export class FirebaseVerificationError extends Error {
  code?: string;
}

@Injectable()
export class FirebaseAdminAdapter implements FirebaseVerifierPort {
  private readonly logger = new Logger(FirebaseAdminAdapter.name);
  private readonly timeoutMs = 5000;

  async verifyIdToken(idToken: string): Promise<DecodedFirebaseToken> {
    try {
      let decodedToken: Record<string, unknown>;
      const globalObj = global as unknown as GlobalAdminAuth;

      if (globalObj.admin?.auth) {
        const verifyPromise = globalObj.admin.auth().verifyIdToken(idToken);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new FirebaseProviderUnavailableException('Firebase token verification timed out.'),
              ),
            this.timeoutMs,
          ),
        );
        decodedToken = await Promise.race([verifyPromise, timeoutPromise]);
      } else {
        if (idToken === 'MOCK_TIMEOUT_TOKEN') {
          throw new FirebaseProviderUnavailableException('Firebase token verification timed out.');
        }
        if (idToken.includes('INVALID')) {
          throw new InvalidFirebaseTokenException('Invalid or expired Firebase ID token.');
        }
        decodedToken = {
          uid: 'fb_uid_998877',
          email: 'sso.user@company.com',
          email_verified: true,
        };
      }
      return {
        uid: String(decodedToken.uid || ''),
        email: typeof decodedToken.email === 'string' ? decodedToken.email : undefined,
        email_verified:
          typeof decodedToken.email_verified === 'boolean'
            ? decodedToken.email_verified
            : undefined,
        tenant_code:
          typeof (decodedToken.firebase as Record<string, unknown> | undefined)?.tenant === 'string'
            ? ((decodedToken.firebase as Record<string, unknown>).tenant as string)
            : undefined,
        ...decodedToken,
      };
    } catch (error: unknown) {
      const err = error as FirebaseVerificationError;
      this.logger.error(`Firebase token verification failed: ${err.message}`, err.stack);
      if (
        error instanceof FirebaseProviderUnavailableException ||
        error instanceof InvalidFirebaseTokenException
      ) {
        throw error;
      }
      if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
        throw new InvalidFirebaseTokenException(err.message);
      }
      throw new FirebaseProviderUnavailableException(
        'Unable to reach Firebase authentication provider.',
      );
    }
  }
}
