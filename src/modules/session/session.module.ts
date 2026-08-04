import { Module } from '@nestjs/common';

import { RedisSessionAdapter } from './adapters/redis-session.adapter';
import { SessionController } from './controllers/session.controller';
import { REDIS_SESSION_ADAPTER_TOKEN, SESSION_SERVICE_TOKEN } from './interfaces/session.interface';
import { SessionService } from './services/session.service';

@Module({
  controllers: [SessionController],
  providers: [
    RedisSessionAdapter,
    {
      provide: REDIS_SESSION_ADAPTER_TOKEN,
      useExisting: RedisSessionAdapter,
    },
    SessionService,
    {
      provide: SESSION_SERVICE_TOKEN,
      useExisting: SessionService,
    },
  ],
  exports: [
    SessionService,
    SESSION_SERVICE_TOKEN,
    RedisSessionAdapter,
    REDIS_SESSION_ADAPTER_TOKEN,
  ],
})
export class SessionModule {}
