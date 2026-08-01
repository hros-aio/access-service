import { Module } from '@nestjs/common';

import { FirebaseSsoApplicationService } from './application/firebase-sso-application.service';
import { FIREBASE_VERIFIER_PORT } from './domain/ports/firebase-verifier.port';
import { FirebaseAdminAdapter } from './infrastructure/adapters/firebase-admin.adapter';
import { FirebaseSsoController } from './presentation/firebase-sso.controller';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { ExternalIdentityRepository } from '../auth/repositories/external-identity.repository';
import { SecurityEventService } from '../security-event/services/security-event.service';

@Module({
  controllers: [FirebaseSsoController],
  providers: [
    {
      provide: FIREBASE_VERIFIER_PORT,
      useClass: FirebaseAdminAdapter,
    },
    ExternalIdentityRepository,
    AuthSecurityEventOutboxRepository,
    SecurityEventService,
    FirebaseSsoApplicationService,
  ],
  exports: [FirebaseSsoApplicationService],
})
export class FirebaseSsoModule {}
