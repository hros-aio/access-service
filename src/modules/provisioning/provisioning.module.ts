import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmployeeLifecycleConsumer } from '../../kafka/consumers/employee-lifecycle.consumer';
import { TenantProvisioningConsumer } from '../../kafka/consumers/tenant-provisioning.consumer';
import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { InviteModule } from '../invite/invite.module';
import { RoleModule } from '../roles/role.module';
import { UserModule } from '../user/user.module';
import { UserGroupModule } from '../user-groups/user-group.module';
import { ConsumedEvent } from './entities/consumed-event.entity';
import { ConsumedEventRepository } from './repositories/consumed-event.repository';
import { ProvisioningApplicationService } from './services/provisioning.application.service';
import { SystemRoleSeederService } from './services/system-role-seeder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsumedEvent]),
    UserModule,
    AuthModule,
    EmployeeModule,
    InviteModule,
    RoleModule,
    UserGroupModule,
  ],
  controllers: [TenantProvisioningConsumer, EmployeeLifecycleConsumer],
  providers: [ConsumedEventRepository, ProvisioningApplicationService, SystemRoleSeederService],
  exports: [ConsumedEventRepository, ProvisioningApplicationService, SystemRoleSeederService],
})
export class ProvisioningModule {}
