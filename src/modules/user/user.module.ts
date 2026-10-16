import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { CognitoUserProvisioningService } from './services/cognito-user-provisioning.service';

import { SecurityEventModule } from '@/modules/security-event/security-event.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SecurityEventModule],
  providers: [UserRepository, CognitoUserProvisioningService],
  exports: [UserRepository, CognitoUserProvisioningService],
})
export class UserModule {}
