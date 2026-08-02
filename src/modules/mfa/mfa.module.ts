import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { KmsCryptoAdapter } from './adapters/kms-crypto.adapter';
import { RedisMfaChallengeAdapter } from './adapters/redis_mfa_challenge.adapter';
import { MfaController } from './controllers/mfa.controller';
import { MfaAdminController } from './controllers/mfa_admin.controller';
import { MfaMethod } from './entities/mfa-method.entity';
import { MfaMethodRepository } from './repositories/mfa-method.repository';
import { MfaAdminApplicationService } from './services/mfa_admin_application.service';
import { MfaApplicationService } from './services/mfa_application.service';

@Module({
  imports: [TypeOrmModule.forFeature([MfaMethod]), forwardRef(() => AuthModule)],
  controllers: [MfaController, MfaAdminController],
  providers: [
    KmsCryptoAdapter,
    RedisMfaChallengeAdapter,
    MfaMethodRepository,
    MfaApplicationService,
    MfaAdminApplicationService,
  ],
  exports: [
    KmsCryptoAdapter,
    RedisMfaChallengeAdapter,
    MfaMethodRepository,
    MfaApplicationService,
    MfaAdminApplicationService,
  ],
})
export class MfaModule {}
