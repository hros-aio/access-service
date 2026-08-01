import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createCorsOptions, setupSwagger, setupVersioning } from '@new-hros/libs-apis';
import { ConfigurationService } from '@new-hros/libs-core';
import { setupKafkaMicroservice } from '@new-hros/libs-events';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const logger = new Logger('Bootstrap');

  const configService = app.get(ConfigurationService);
  const port = configService.get<number>('app.port') ?? 3000;

  // Configure CORS
  app.enableCors(createCorsOptions());

  // Configure API Versioning (MEDIA_TYPE versioning as per shared library implementation)
  setupVersioning(app, { defaultVersion: '1' });

  // Configure Swagger Documentation
  setupSwagger(app, {
    enabled: true,
    title: 'HRMS Access Service',
    description: 'API documentation for the HRMS Access Service',
    version: '1.0.0',
    path: 'docs',
    bearerAuth: true,
  });

  // Enable Graceful Shutdown hooks
  app.enableShutdownHooks();

  // Configure Kafka Microservice
  const brokers = configService.get<string[]>('kafka.brokers') ?? ['localhost:9092'];
  await setupKafkaMicroservice(app, {
    client: {
      brokers,
      clientId: 'hrms-access-service-client',
    },
    consumer: {
      groupId: 'hrms-access-service-group',
    },
    failedCount: 3,
    retryDelayMs: 1000,
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/docs`);
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Fatal startup error', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
