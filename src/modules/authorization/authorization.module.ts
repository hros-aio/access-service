import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { PermissionsModule } from '../permissions';
import { RoleModule } from '../roles/role.module';
import { SecurityEventModule } from '../security-event';
import { UserModule } from '../user/user.module';
import { UserEffectiveRole, UserGroupModule } from '../user-groups';
import { AuthorizationSyncController } from './controllers/authorization-sync.controller';
import { BootstrapAuthorizationController } from './controllers/bootstrap-authorization.controller';
import { AuthorizationSyncJob } from './entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from './repositories/authorization-sync-job.repository';
import { UserEffectiveRoleRepository } from './repositories/user-effective-role.repository';
import { AuthorizationReconciliationWorker } from './services/authorization-reconciliation-worker.service';
import { AuthorizationSyncService } from './services/authorization-sync.service';
import { BootstrapAuthorizationService } from './services/bootstrap-authorization.service';
import { CumulativeAccessEvaluator } from './services/cumulative-access-evaluator.service';
import { DistributedLockAdapter } from './services/distributed-lock.adapter';
import { EffectiveRoleProjectionService } from './services/effective-role-projection.service';
import { ScheduledReconciliationScanner } from './services/scheduled-reconciliation-scanner.service';
import { SyncJobWatchdogService } from './services/sync-job-watchdog.service';
import { SyncStatusProjectionService } from './services/sync-status-projection.service';
import { UserAuthorizationCacheService } from './services/user-authorization-cache.service';

import { AuthorizationHandler } from '@/handlers/authorization.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEffectiveRole, AuthorizationSyncJob]),
    RoleModule,
    UserGroupModule,
    EmployeeModule,
    PermissionsModule,
    AuthModule,
    SecurityEventModule,
    forwardRef(() => UserModule),
  ],
  controllers: [
    BootstrapAuthorizationController,
    AuthorizationSyncController,
    AuthorizationHandler,
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
    DistributedLockAdapter,
    ScheduledReconciliationScanner,
    SyncStatusProjectionService,
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
    DistributedLockAdapter,
    ScheduledReconciliationScanner,
    SyncStatusProjectionService,
  ],
})
export class AuthorizationModule {}
