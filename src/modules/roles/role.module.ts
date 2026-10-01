import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from '@new-hros/libs-sql';

import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions';
import { AuthSecurityEventOutboxRepository, OutboxEventRepository } from '../security-event';
import { RoleController } from './controllers/role.controller';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { RolePermissionRepository } from './repositories/role-permission.repository';
import { RoleRepository } from './repositories/role.repository';
import { RoleCacheService } from './services/role-cache.service';
import { RoleApplicationService } from './services/role.application.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, RolePermission, OutboxEventEntity]),
    PermissionsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [RoleController],
  providers: [
    RoleRepository,
    RolePermissionRepository,
    RoleCacheService,
    RoleApplicationService,
    OutboxEventRepository,
    {
      provide: AuthSecurityEventOutboxRepository,
      useExisting: OutboxEventRepository,
    },
  ],
  exports: [RoleRepository, RolePermissionRepository, RoleCacheService, RoleApplicationService],
})
export class RoleModule {}
