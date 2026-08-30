import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { PermissionsModule } from '../permissions';
import { RoleModule } from '../roles/role.module';
import { UserGroupModule } from '../user-groups';
import { AuthorizationConsumer } from '../../kafka/consumers/authorization.consumer';
import { AuthorizationSyncController } from './controllers/authorization-sync.controller';
import { BootstrapAuthorizationController } from './controllers/bootstrap-authorization.controller';
import { AuthorizationSyncJob } from './entities/authorization-sync-job.entity';
import { UserEffectiveRoleEntity } from './entities/user-effective-role.entity';
import { AuthorizationGuard } from './guards/authorization.guard';
import { AuthorizationSyncJobRepository } from './repositories/authorization-sync-job.repository';
import { UserEffectiveRoleRepository } from './repositories/user-effective-role.repository';
import { AuthorizationReconciliationWorker } from './services/authorization-reconciliation-worker.service';
import { AuthorizationSyncService } from './services/authorization-sync.service';
import { BootstrapAuthorizationService } from './services/bootstrap-authorization.service';
import { CumulativeAccessEvaluator } from './services/cumulative-access-evaluator.service';
import { EffectiveRoleProjectionService } from './services/effective-role-projection.service';
import { SyncJobWatchdogService } from './services/sync-job-watchdog.service';
import { UserAuthorizationCacheService } from './services/user-authorization-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEffectiveRoleEntity, AuthorizationSyncJob]),
    RoleModule,
    UserGroupModule,
    EmployeeModule,
    PermissionsModule,
    AuthModule,
  ],
  controllers: [
    BootstrapAuthorizationController,
    AuthorizationSyncController,
    AuthorizationConsumer,
  ],
  providers: [
    UserEffectiveRoleRepository,
    AuthorizationSyncJobRepository,
    UserAuthorizationCacheService,
    EffectiveRoleProjectionService,
    CumulativeAccessEvaluator,
    BootstrapAuthorizationService,
    AuthorizationSyncService,
    AuthorizationReconciliationWorker,
    SyncJobWatchdogService,
    AuthorizationGuard,
  ],
  exports: [
    UserEffectiveRoleRepository,
    AuthorizationSyncJobRepository,
    UserAuthorizationCacheService,
    EffectiveRoleProjectionService,
    CumulativeAccessEvaluator,
    BootstrapAuthorizationService,
    AuthorizationSyncService,
    AuthorizationReconciliationWorker,
    SyncJobWatchdogService,
    AuthorizationGuard,
  ],
})
export class AuthorizationModule {}
