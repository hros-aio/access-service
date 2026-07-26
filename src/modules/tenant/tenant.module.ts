import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthenticationSettings } from './entities/authentication-settings.entity';
import { Tenant } from './entities/tenant.entity';
import { AuthenticationSettingsRepository } from './repositories/authentication-settings.repository';
import { TenantRepository } from './repositories/tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, AuthenticationSettings])],
  providers: [TenantRepository, AuthenticationSettingsRepository],
  exports: [TenantRepository, AuthenticationSettingsRepository],
})
export class TenantModule {}
