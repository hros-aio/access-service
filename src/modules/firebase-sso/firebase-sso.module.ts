import { Module } from '@nestjs/common';

import { SecurityEventModule } from '../security-event/security-event.module';
import { UserModule } from '../user/user.module';
import { FirebaseSsoApplicationService } from './application/firebase-sso-application.service';
import { FIREBASE_VERIFIER_PORT } from './domain/ports/firebase-verifier.port';
import { FirebaseAdminAdapter } from './infrastructure/adapters/firebase-admin.adapter';

@Module({
  imports: [UserModule, SecurityEventModule],
  providers: [
    {
      provide: FIREBASE_VERIFIER_PORT,
      useClass: FirebaseAdminAdapter,
    },
    FirebaseSsoApplicationService,
  ],
  exports: [FirebaseSsoApplicationService],
})
export class FirebaseSsoModule {}
