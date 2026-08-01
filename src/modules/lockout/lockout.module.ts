import { Module } from '@nestjs/common';

import { LockoutService } from './services/lockout.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [LockoutService],
  exports: [LockoutService],
})
export class LockoutModule {}
