import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserGroupAdminController } from './controllers/user-group-admin.controller';
import { UserGroupPopulationController } from './controllers/user-group-population.controller';
import { UserGroupRoleController } from './controllers/user-group-role.controller';
import { UserGroupScopeController } from './controllers/user-group-scope.controller';
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
import { RoleAssignmentImpactService } from './services/role-assignment-impact.service';
import { UserGroupLifecycleService } from './services/user-group-lifecycle.service';
import { UserGroupMatchingEngine } from './services/user-group-matching.engine';
import { UserGroupPopulationQueryService } from './services/user-group-population-query.service';
import { UserGroupQueryService } from './services/user-group-query.service';
import { UserGroupRoleAssignmentService } from './services/user-group-role-assignment.service';
import { UserGroupScopeImpactService } from './services/user-group-scope-impact.service';
import { UserGroupScopeService } from './services/user-group-scope.service';
import { AuthSecurityEventOutbox } from '../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../auth/repositories/auth-security-event-outbox.repository';
import { EmployeeModule } from '../employee/employee.module';
import { RoleModule } from '../roles/role.module';

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
    RoleModule,
  ],
  controllers: [
    UserGroupAdminController,
    UserGroupPopulationController,
    UserGroupRoleController,
    UserGroupScopeController,
  ],
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
    RoleAssignmentImpactService,
    UserGroupRoleAssignmentService,
    UserGroupScopeImpactService,
    UserGroupScopeService,
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
    RoleAssignmentImpactService,
    UserGroupRoleAssignmentService,
    UserGroupScopeImpactService,
    UserGroupScopeService,
  ],
})
export class UserGroupModule {}
