import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CACHE_PROVIDER_TOKEN, CacheService, RedisCacheProvider } from '@new-hros/libs-core';

import { AuthSecurityEventOutbox } from './entities/auth-security-event-outbox.entity';
import { Credential } from './entities/credential.entity';
import { ExternalIdentity } from './entities/external-identity.entity';
import { AuthSecurityEventOutboxRepository } from './repositories/auth-security-event-outbox.repository';
import { CredentialRepository } from './repositories/credential.repository';
import { ExternalIdentityRepository } from './repositories/external-identity.repository';
import { SessionApplicationService } from './services/session.application.service';

@Module({
  imports: [TypeOrmModule.forFeature([Credential, ExternalIdentity, AuthSecurityEventOutbox])],
  providers: [
    CredentialRepository,
    ExternalIdentityRepository,
    AuthSecurityEventOutboxRepository,
    SessionApplicationService,
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
    RedisCacheProvider,
  ],
})
export class AuthModule {}
