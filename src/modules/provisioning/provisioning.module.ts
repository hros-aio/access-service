import { Module } from '@nestjs/common';

import { EmployeeLifecycleConsumer } from '../../kafka/consumers/employee-lifecycle.consumer';
import { TenantProvisioningConsumer } from '../../kafka/consumers/tenant-provisioning.consumer';
import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { InviteModule } from '../invite/invite.module';
import { RoleModule } from '../roles/role.module';
import { SecurityEventModule } from '../security-event/security-event.module';
import { UserModule } from '../user/user.module';
import { UserGroupModule } from '../user-groups/user-group.module';
import { ProvisioningApplicationService } from './services/provisioning.application.service';
import { SystemRoleSeederService } from './services/system-role-seeder.service';

@Module({
  imports: [
    UserModule,
    AuthModule,
    EmployeeModule,
    InviteModule,
    RoleModule,
    UserGroupModule,
    SecurityEventModule,
  ],
  controllers: [TenantProvisioningConsumer, EmployeeLifecycleConsumer],
  providers: [ProvisioningApplicationService, SystemRoleSeederService],
  exports: [ProvisioningApplicationService, SystemRoleSeederService],
})
export class ProvisioningModule {}
