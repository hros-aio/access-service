import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminInvitationController } from './controllers/admin-invitation.controller';
import { InvitationController } from './controllers/invitation.controller';
import { Invitation } from './entities/invitation.entity';
import { InvitationRepository } from './repositories/invitation.repository';
import { CryptoAdapter } from './services/crypto.adapter';
import { InvitationApplicationService } from './services/invitation.application.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation]), AuthModule, UserModule],
  controllers: [InvitationController, AdminInvitationController],
  providers: [InvitationRepository, InvitationApplicationService, CryptoAdapter],
  exports: [InvitationRepository, InvitationApplicationService, CryptoAdapter],
})
export class InviteModule {}
