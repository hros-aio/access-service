import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PermissionsModule } from '../permissions';
import { BootstrapAuthorizationController } from './controllers/bootstrap-authorization.controller';
import { UserEffectiveRoleEntity } from './entities/user-effective-role.entity';
import { AuthorizationGuard } from './guards/authorization.guard';
import { UserEffectiveRoleRepository } from './repositories/user-effective-role.repository';
import { BootstrapAuthorizationService } from './services/bootstrap-authorization.service';
import { CumulativeAccessEvaluator } from './services/cumulative-access-evaluator.service';
import { EffectiveRoleProjectionService } from './services/effective-role-projection.service';
import { UserAuthorizationCacheService } from './services/user-authorization-cache.service';
import { RoleModule } from '../roles/role.module';
import { UserGroupModule } from '../user-groups/user-group.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEffectiveRoleEntity]),
    RoleModule,
    UserGroupModule,
    PermissionsModule,
  ],
  controllers: [BootstrapAuthorizationController],
  providers: [
    UserEffectiveRoleRepository,
    UserAuthorizationCacheService,
    EffectiveRoleProjectionService,
    CumulativeAccessEvaluator,
    BootstrapAuthorizationService,
    AuthorizationGuard,
  ],
  exports: [
    UserEffectiveRoleRepository,
    UserAuthorizationCacheService,
    EffectiveRoleProjectionService,
    CumulativeAccessEvaluator,
    BootstrapAuthorizationService,
    AuthorizationGuard,
  ],
})
export class AuthorizationModule {}
