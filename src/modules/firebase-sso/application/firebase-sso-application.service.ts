import { Inject, Injectable, Logger } from '@nestjs/common';

import { ExternalIdentityRepository } from '../../auth/repositories/external-identity.repository';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
} from '../domain/exceptions/firebase-sso.exceptions';
import {
  FIREBASE_VERIFIER_PORT,
  FirebaseVerifierPort,
} from '../domain/ports/firebase-verifier.port';
import { LoginWithFirebaseDto } from '../presentation/dto/login-with-firebase.dto';

export interface FirebaseSsoAuthResult {
  authState: 'ACTIVE' | 'PASSWORD_SETUP_REQUIRED' | 'MFA_REQUIRED';
  accessToken?: string;
  refreshToken?: string;
  flowId?: string;
  challengeId?: string;
  allowedMethods?: string[];
  expiresIn: number;
}

@Injectable()
export class FirebaseSsoApplicationService {
  private readonly logger = new Logger(FirebaseSsoApplicationService.name);

  constructor(
    @Inject(FIREBASE_VERIFIER_PORT)
    private readonly firebaseVerifier: FirebaseVerifierPort,
    private readonly externalIdentityRepository: ExternalIdentityRepository,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async authenticateSso(
    dto: LoginWithFirebaseDto,
    sourceIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<FirebaseSsoAuthResult> {
    const decodedToken = await this.firebaseVerifier.verifyIdToken(dto.idToken);
    const providerSubject = decodedToken.uid;

    const mappings = await this.externalIdentityRepository.findMapping(
      dto.tenantCode,
      'firebase',
      providerSubject,
    );

    if (!mappings || mappings.length === 0) {
      await this.securityEventService.logSsoLoginFailed(
        dto.tenantCode,
        providerSubject,
        'UNMAPPED_EXTERNAL_IDENTITY',
        sourceIp,
        undefined,
        userAgent,
      );
      throw new ExternalIdentityNotMappedException();
    }

    if (mappings.length > 1) {
      await this.securityEventService.logSsoLoginFailed(
        dto.tenantCode,
        providerSubject,
        'IDENTITY_AMBIGUITY_CONFLICT',
        sourceIp,
        undefined,
        userAgent,
      );
      throw new AmbiguousIdentityMappingException();
    }

    const targetUser = mappings[0];
    this.logger.log(`SSO authenticated user ${targetUser.userId} for tenant ${dto.tenantCode}`);

    await this.securityEventService.logSsoLoginSucceeded(
      dto.tenantCode,
      targetUser.userId,
      providerSubject,
      'ACTIVE',
      sourceIp,
      userAgent,
    );

    return {
      authState: 'ACTIVE',
      accessToken: 'mock_sso_access_token',
      refreshToken: 'mock_sso_refresh_token',
      expiresIn: 900,
    };
  }
}
