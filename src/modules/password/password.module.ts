import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InviteModule } from '../invite/invite.module';
import { PasswordController } from './controllers/password.controller';
import { RestrictedSessionGuard } from './guards/restricted-session.guard';
import { CredentialPolicy } from './services/credential.policy';
import { PasswordService } from './services/password.service';

@Module({
  imports: [AuthModule, InviteModule],
  controllers: [PasswordController],
  providers: [PasswordService, CredentialPolicy, RestrictedSessionGuard],
  exports: [PasswordService],
})
export class PasswordModule {}
