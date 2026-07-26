import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MfaMethod } from './entities/mfa-method.entity';
import { MfaMethodRepository } from './repositories/mfa-method.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MfaMethod])],
  providers: [MfaMethodRepository],
  exports: [MfaMethodRepository],
})
export class MfaModule {}
