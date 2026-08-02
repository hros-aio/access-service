import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CACHE_PROVIDER_TOKEN, CacheService, RedisCacheProvider } from '@new-hros/libs-core';

import { AuthController } from './controllers/auth.controller';
import { AuthSecurityEventOutbox } from './entities/auth-security-event-outbox.entity';
import { Credential } from './entities/credential.entity';
import { ExternalIdentity } from './entities/external-identity.entity';
import { AuthSecurityEventOutboxRepository } from './repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from './repositories/credential.repository';
import { ExternalIdentityRepository } from './repositories/external-identity.repository';
import { AuthApplicationService } from './services/auth.application.service';
import { CredentialDomainService } from './services/credential.domain.service';
import { SessionApplicationService } from './services/session.application.service';
import { IpRestrictionService } from '../ip-restriction/services/ip-restriction.service';
import { LockoutService } from '../lockout/services/lockout.service';
import { MfaModule } from '../mfa/mfa.module';
import { SecurityEventService } from '../security-event/services/security-event.service';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Credential, ExternalIdentity, AuthSecurityEventOutbox]),
    TenantModule,
    UserModule,
    forwardRef(() => MfaModule),
  ],
  controllers: [AuthController],
  providers: [
    CredentialRepository,
    ExternalIdentityRepository,
    AuthSecurityEventOutboxRepository,
    SessionApplicationService,
    CredentialDomainService,
    AuthApplicationService,
    SecurityEventService,
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
    ExternalIdentityRepository,
    AuthSecurityEventOutboxRepository,
    SessionApplicationService,
    CredentialDomainService,
    AuthApplicationService,
    SecurityEventService,
    IpRestrictionService,
    LockoutService,
    RedisCacheProvider,
  ],
})
export class AuthModule {}
