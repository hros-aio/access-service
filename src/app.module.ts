import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApisModule } from '@new-hros/libs-apis';
import { CognitoModule } from '@new-hros/libs-aws';
import {
  CacheModule,
  CacheModuleOptions,
  ConfigurationModule,
  ConfigurationService,
  CoreModule,
} from '@new-hros/libs-core';
import { SqlModule } from '@new-hros/libs-sql';

import { modules } from './modules';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  imports: [
    ConfigurationModule.register({ configDir: 'config', envPath: '.env' }),
    CoreModule.forRoot(),
    CacheModule.registerAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService): CacheModuleOptions => {
        return {
          redis: {
            host: config.get<string>('redis.host') ?? 'localhost',
            port: config.get<number>('redis.port') ?? 6379,
          },
        };
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
    {
      ...CognitoModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          region: config.get<string>('AWS_REGION', 'us-east-1'),
          userPoolId: config.getOrThrow<string>('AWS_COGNITO_USER_POOL_ID'),
          clientId: config.get<string>('AWS_COGNITO_CLIENT_ID'),
          clientSecret: config.get<string>('AWS_COGNITO_CLIENT_SECRET'),
        }),
      }),
      global: true,
    },
    ...modules,
  ],
})
export class AppModule {}
