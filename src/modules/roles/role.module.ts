import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { PermissionsModule } from '../permissions';
import { RoleController } from './controllers/role.controller';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { RolePermissionRepository } from './repositories/role-permission.repository';
import { RoleRepository } from './repositories/role.repository';
import { RoleCacheService } from './services/role-cache.service';
import { RoleApplicationService } from './services/role.application.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, RolePermission, AuthSecurityEventOutbox]),
    PermissionsModule,
  ],
  controllers: [RoleController],
  providers: [
    RoleRepository,
    RolePermissionRepository,
    RoleCacheService,
    RoleApplicationService,
    AuthSecurityEventOutboxRepository,
  ],
  exports: [RoleRepository, RolePermissionRepository, RoleCacheService, RoleApplicationService],
})
export class RoleModule {}
