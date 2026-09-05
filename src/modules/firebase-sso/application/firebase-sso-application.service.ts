import { Inject, Injectable, Logger } from '@nestjs/common';

import { LoginWithFirebaseDto } from '../../auth/dto/login-with-firebase.dto';
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

@Injectable()
export class FirebaseSsoApplicationService {
  private readonly logger = new Logger(FirebaseSsoApplicationService.name);

  constructor(
    @Inject(FIREBASE_VERIFIER_PORT)
    private readonly firebaseVerifier: FirebaseVerifierPort,
    private readonly userRepo: UserRepository,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async authenticateSso(
    dto: LoginWithFirebaseDto,
    sourceIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<User> {
    const decodedToken = await this.firebaseVerifier.verifyIdToken(dto.idToken);
    const providerSubject = decodedToken.uid;

    const user = await this.userRepo.findByTenantAndExternalIdentity(
      dto.tenantCode,
      providerSubject,
    );

    if (!user || user.normalizedEmail !== decodedToken.email) {
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

    if (decodedToken.tenant_code !== dto.tenantCode) {
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

    await this.securityEventService.logSsoLoginSucceeded(
      dto.tenantCode,
      user.id,
      providerSubject,
      'ACTIVE',
      sourceIp,
      userAgent,
    );

    return user;
  }
}
