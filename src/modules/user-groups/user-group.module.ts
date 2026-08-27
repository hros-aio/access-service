import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserGroupAdminController } from './controllers/user-group-admin.controller';
import { UserGroupRole } from './entities/user-group-role.entity';
import { UserGroup } from './entities/user-group.entity';
import { UserGroupRoleRepository } from './repositories/user-group-role.repository';
import { UserGroupRepository } from './repositories/user-group.repository';
import { UserGroupLifecycleService } from './services/user-group-lifecycle.service';
import { UserGroupQueryService } from './services/user-group-query.service';
import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserGroup, UserGroupRole, AuthSecurityEventOutbox])],
  controllers: [UserGroupAdminController],
  providers: [
    UserGroupRepository,
    UserGroupRoleRepository,
    UserGroupLifecycleService,
    UserGroupQueryService,
    AuthSecurityEventOutboxRepository,
  ],
  exports: [
    UserGroupRepository,
    UserGroupRoleRepository,
    UserGroupLifecycleService,
    UserGroupQueryService,
  ],
})
export class UserGroupModule {}
