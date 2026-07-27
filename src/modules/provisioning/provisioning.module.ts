import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SqlModule } from '@new-hros/libs-sql';

import { TenantProvisioningConsumer } from '../../kafka/consumers/tenant-provisioning.consumer';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ConsumedEvent } from './entities/consumed-event.entity';
import { ConsumedEventRepository } from './repositories/consumed-event.repository';
import { ProvisioningApplicationService } from './services/provisioning.application.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumedEvent]), SqlModule, UserModule, AuthModule],
  controllers: [TenantProvisioningConsumer],
  providers: [ConsumedEventRepository, ProvisioningApplicationService],
  exports: [ConsumedEventRepository, ProvisioningApplicationService],
})
export class ProvisioningModule {}
