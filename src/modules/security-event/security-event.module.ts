import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from '@new-hros/libs-sql';

import {
  AuthSecurityEventOutboxRepository,
  OutboxEventRepository,
} from './repositories/outbox-event.repository';
import { OutboxEventService } from './services/outbox-event.service';
import { SecurityEventService } from './services/security-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [
    OutboxEventRepository,
    {
      provide: AuthSecurityEventOutboxRepository,
      useExisting: OutboxEventRepository,
    },
    OutboxEventService,
    SecurityEventService,
  ],
  exports: [
    OutboxEventRepository,
    AuthSecurityEventOutboxRepository,
    OutboxEventService,
    SecurityEventService,
    TypeOrmModule,
  ],
})
export class SecurityEventModule {}
