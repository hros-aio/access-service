import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserGroupAdminController } from './controllers/user-group-admin.controller';
import { UserGroupPopulationController } from './controllers/user-group-population.controller';
import { UserEffectiveRole } from './entities/user-effective-role.entity';
import { UserGroupMembership } from './entities/user-group-membership.entity';
import { UserGroupRole } from './entities/user-group-role.entity';
import { UserGroup } from './entities/user-group.entity';
import { UserEffectiveRoleRepository } from './repositories/user-effective-role.repository';
import { UserGroupMembershipRepository } from './repositories/user-group-membership.repository';
import { UserGroupRoleRepository } from './repositories/user-group-role.repository';
import { UserGroupRepository } from './repositories/user-group.repository';
import { EmployeeAttributePropagationService } from './services/employee-attribute-propagation.service';
import { MembershipReconciler } from './services/membership-reconciler.service';
import { UserGroupLifecycleService } from './services/user-group-lifecycle.service';
import { UserGroupMatchingEngine } from './services/user-group-matching.engine';
import { UserGroupPopulationQueryService } from './services/user-group-population-query.service';
import { UserGroupQueryService } from './services/user-group-query.service';
import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { EmployeeModule } from '../employee/employee.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserGroup,
      UserGroupRole,
      UserGroupMembership,
      UserEffectiveRole,
      AuthSecurityEventOutbox,
    ]),
    EmployeeModule,
  ],
  controllers: [UserGroupAdminController, UserGroupPopulationController],
  providers: [
    UserGroupRepository,
    UserGroupRoleRepository,
    UserGroupMembershipRepository,
    UserEffectiveRoleRepository,
    AuthSecurityEventOutboxRepository,
    UserGroupLifecycleService,
    UserGroupQueryService,
    UserGroupMatchingEngine,
    MembershipReconciler,
    EmployeeAttributePropagationService,
    UserGroupPopulationQueryService,
  ],
  exports: [
    UserGroupRepository,
    UserGroupRoleRepository,
    UserGroupMembershipRepository,
    UserEffectiveRoleRepository,
    UserGroupLifecycleService,
    UserGroupQueryService,
    UserGroupMatchingEngine,
    MembershipReconciler,
    EmployeeAttributePropagationService,
    UserGroupPopulationQueryService,
  ],
})
export class UserGroupModule {}
