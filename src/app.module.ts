import { Module } from '@nestjs/common';
import { ApisModule } from '@new-hros/libs-apis';
import { ConfigurationModule, ConfigurationService, CoreModule } from '@new-hros/libs-core';
import { SqlModule } from '@new-hros/libs-sql';

import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { HealthModule } from './modules/health/health.module';
import { ImpactAnalysisModule } from './modules/impact-analysis/impact-analysis.module';
import { InviteModule } from './modules/invite/invite.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { PasswordModule } from './modules/password/password.module';
import { PermissionsModule } from './modules/permissions';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { RoleModule } from './modules/roles/role.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { UserGroupModule } from './modules/user-groups/user-group.module';

const config = new ConfigurationService({});

@Module({
  imports: [
    ConfigurationModule.register({ configDir: 'config', envPath: '.env' }),
    CoreModule.forRoot({
      cache: {
        store: 'redis',
        host: config.get<string>('redis.host') ?? 'localhost',
        port: config.get<number>('redis.port') ?? 6379,
      },
    }),
    ApisModule.forRootAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => ({
        auth: {
          publicKey: config.get<string>('jwt.publicKey'),
          privateKey: config.get<string>('jwt.privateKey'),
        },
      }),
    }),
    HealthModule,
    MetricsModule,
    SqlModule.forRootAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
    TenantModule,
    EmployeeModule,
    UserModule,
    InviteModule,
    AuthModule,
    MfaModule,
    PasswordModule,
    PermissionsModule,
    RoleModule,
    UserGroupModule,
    ImpactAnalysisModule,
    AuthorizationModule,
    ProvisioningModule,
  ],
})
export class AppModule {}
