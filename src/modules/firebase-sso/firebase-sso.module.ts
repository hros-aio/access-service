import { Module } from '@nestjs/common';

import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { SecurityEventService } from '../security-event/services/security-event.service';
import { UserModule } from '../user/user.module';
import { FirebaseSsoApplicationService } from './application/firebase-sso-application.service';
import { FIREBASE_VERIFIER_PORT } from './domain/ports/firebase-verifier.port';
import { FirebaseAdminAdapter } from './infrastructure/adapters/firebase-admin.adapter';

@Module({
  imports: [UserModule],
  providers: [
    {
      provide: FIREBASE_VERIFIER_PORT,
      useClass: FirebaseAdminAdapter,
    },
    AuthSecurityEventOutboxRepository,
    SecurityEventService,
    FirebaseSsoApplicationService,
  ],
  exports: [FirebaseSsoApplicationService],
})
export class FirebaseSsoModule {}
