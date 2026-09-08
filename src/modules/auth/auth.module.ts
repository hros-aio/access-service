import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CACHE_PROVIDER_TOKEN, CacheService, RedisCacheProvider } from '@new-hros/libs-core';

import { FirebaseSsoModule } from '../firebase-sso/firebase-sso.module';
import { IpRestrictionService } from '../ip-restriction/services/ip-restriction.service';
import { LockoutService } from '../lockout/services/lockout.service';
import { MfaModule } from '../mfa/mfa.module';
import { SecurityEventModule } from '../security-event/security-event.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './controllers/auth.controller';
import { Credential } from './entities/credential.entity';
import { CredentialRepository } from './repositories/credential.repository';
import { AuthApplicationService } from './services/auth.application.service';
import { CredentialDomainService } from './services/credential.domain.service';
import { SessionApplicationService } from './services/session.application.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Credential]),
    TenantModule,
    UserModule,
    SecurityEventModule,
    forwardRef(() => MfaModule),
    forwardRef(() => FirebaseSsoModule),
  ],
  controllers: [AuthController],
  providers: [
    CredentialRepository,
    SessionApplicationService,
    CredentialDomainService,
    AuthApplicationService,
    IpRestrictionService,
    LockoutService,
    {
      provide: RedisCacheProvider,
      useFactory: (cacheService: CacheService): RedisCacheProvider => cacheService['l2'],
      inject: [CACHE_PROVIDER_TOKEN],
    },
  ],
  exports: [
    CredentialRepository,
    SessionApplicationService,
    CredentialDomainService,
    AuthApplicationService,
    IpRestrictionService,
    LockoutService,
    RedisCacheProvider,
  ],
})
export class AuthModule {}
