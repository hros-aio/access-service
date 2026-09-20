import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { InviteModule } from '../invite/invite.module';
import { RoleModule } from '../roles/role.module';
import { SecurityEventModule } from '../security-event/security-event.module';
import { UserModule } from '../user/user.module';
import { UserGroupModule } from '../user-groups/user-group.module';
import { ProvisioningApplicationService } from './services/provisioning.application.service';
import { SystemRoleSeederService } from './services/system-role-seeder.service';

import { EmployeeLifecycleHandler } from '@/handlers/employee-lifecycle.handler';
import { TenantProvisioningHandler } from '@/handlers/tenant-provisioning.handler';

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
  controllers: [TenantProvisioningHandler, EmployeeLifecycleHandler],
  providers: [ProvisioningApplicationService, SystemRoleSeederService],
  exports: [ProvisioningApplicationService, SystemRoleSeederService],
})
export class ProvisioningModule {}
