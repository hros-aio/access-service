import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SqlModule } from '@new-hros/libs-sql';

import { EmployeeLifecycleConsumer } from '../../kafka/consumers/employee-lifecycle.consumer';
import { TenantProvisioningConsumer } from '../../kafka/consumers/tenant-provisioning.consumer';
import { AuthModule } from '../auth/auth.module';
import { EmployeeModule } from '../employee/employee.module';
import { InviteModule } from '../invite/invite.module';
import { UserModule } from '../user/user.module';
import { ConsumedEvent } from './entities/consumed-event.entity';
import { ConsumedEventRepository } from './repositories/consumed-event.repository';
import { ProvisioningApplicationService } from './services/provisioning.application.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsumedEvent]),
    SqlModule,
    UserModule,
    AuthModule,
    EmployeeModule,
    InviteModule,
  ],
  controllers: [TenantProvisioningConsumer, EmployeeLifecycleConsumer],
  providers: [ConsumedEventRepository, ProvisioningApplicationService],
  exports: [ConsumedEventRepository, ProvisioningApplicationService],
})
export class ProvisioningModule {}
