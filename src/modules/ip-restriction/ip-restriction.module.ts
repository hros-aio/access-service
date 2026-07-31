import { Module } from '@nestjs/common';

import { IpRestrictionService } from './services/ip-restriction.service';

@Module({
  providers: [IpRestrictionService],
  exports: [IpRestrictionService],
})
export class IpRestrictionModule {}
