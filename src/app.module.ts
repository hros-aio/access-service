import fs from 'fs';
import path from 'path';

import { Module } from '@nestjs/common';
import { ApisModule } from '@new-hros/libs-apis';
import { ConfigurationModule, ConfigurationService, CoreModule } from '@new-hros/libs-core';
import { SqlModule } from '@new-hros/libs-sql';

import { AuthModule } from './modules/auth/auth.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { HealthModule } from './modules/health/health.module';
import { InviteModule } from './modules/invite/invite.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { PasswordModule } from './modules/password/password.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';

// Load local .env file if available
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
      val = val.replace(/\\n/g, '\n');
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

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
    TenantModule,
    EmployeeModule,
    UserModule,
    InviteModule,
    AuthModule,
    MfaModule,
    PasswordModule,
    ProvisioningModule,
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
  ],
})
export class AppModule {}
