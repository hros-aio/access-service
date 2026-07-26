import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Invitation } from './entities/invitation.entity';
import { InvitationRepository } from './repositories/invitation.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation])],
  providers: [InvitationRepository],
  exports: [InvitationRepository],
})
export class InviteModule {}
