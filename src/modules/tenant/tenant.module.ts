import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthenticationSettingsController } from './controllers/authentication-settings.controller';
import { AuthenticationSettings } from './entities/authentication-settings.entity';
import { Tenant } from './entities/tenant.entity';
import { AuthenticationSettingsRepository } from './repositories/authentication-settings.repository';
import { TenantRepository } from './repositories/tenant.repository';
import { AuthenticationSettingsService } from './services/authentication-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, AuthenticationSettings])],
  controllers: [AuthenticationSettingsController],
  providers: [TenantRepository, AuthenticationSettingsRepository, AuthenticationSettingsService],
  exports: [TenantRepository, AuthenticationSettingsRepository, AuthenticationSettingsService],
})
export class TenantModule {}
