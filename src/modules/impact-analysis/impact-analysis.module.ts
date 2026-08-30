import { Module, forwardRef } from '@nestjs/common';

import { RoleModule } from '../roles/role.module';
import { UserGroupModule } from '../user-groups/user-group.module';
import { ImpactAnalysisController } from './controllers/impact-analysis.controller';
import { ImpactAnalysisService } from './services/impact-analysis.service';

@Module({
  imports: [forwardRef(() => RoleModule), forwardRef(() => UserGroupModule)],
  controllers: [ImpactAnalysisController],
  providers: [ImpactAnalysisService],
  exports: [ImpactAnalysisService],
})
export class ImpactAnalysisModule {}
