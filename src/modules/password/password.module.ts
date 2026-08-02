import { Module } from '@nestjs/common';

import { PasswordResetRedisAdapter } from './adapters/password-reset-redis.adapter';
import { PasswordController } from './controllers/password.controller';
import { RestrictedSessionGuard } from './guards/restricted-session.guard';
import { CredentialPolicy } from './services/credential.policy';
import { PasswordService } from './services/password.service';
import { AuthModule } from '../auth/auth.module';
import { InviteModule } from '../invite/invite.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [AuthModule, InviteModule, TenantModule],
  controllers: [PasswordController],
  providers: [PasswordService, CredentialPolicy, RestrictedSessionGuard, PasswordResetRedisAdapter],
  exports: [PasswordService],
})
export class PasswordModule {}
