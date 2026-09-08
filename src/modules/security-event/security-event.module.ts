import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthSecurityEventOutbox } from './entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from './repositories/auth-security-event-outbox.repository';
import { SecurityEventService } from './services/security-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSecurityEventOutbox])],
  providers: [AuthSecurityEventOutboxRepository, SecurityEventService],
  exports: [AuthSecurityEventOutboxRepository, SecurityEventService, TypeOrmModule],
})
export class SecurityEventModule {}
