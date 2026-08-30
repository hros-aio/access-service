import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ImpactAnalysisResultDto, PreviewRoleImpactDto, PreviewUserGroupImpactDto } from '../dto';
import { ImpactAnalysisService } from '../services/impact-analysis.service';

@ApiTags('Impact Analysis')
@ApiBearerAuth()
@Controller()
export class ImpactAnalysisController {
  constructor(private readonly impactService: ImpactAnalysisService) {}

  @Post('roles/:id/impact-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview blast radius for proposed Role modifications' })
  @ApiResponse({
    status: 200,
    type: ImpactAnalysisResultDto,
    description: 'Role blast radius computed',
  })
  async previewRoleImpact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PreviewRoleImpactDto,
  ): Promise<ImpactAnalysisResultDto> {
    return this.impactService.previewRoleImpact(id, dto);
  }

  @Post('user-groups/:id/impact-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview blast radius for proposed User Group modifications' })
  @ApiResponse({
    status: 200,
    type: ImpactAnalysisResultDto,
    description: 'User Group blast radius computed',
  })
  async previewUserGroupImpact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PreviewUserGroupImpactDto,
  ): Promise<ImpactAnalysisResultDto> {
    return this.impactService.previewUserGroupImpact(id, dto);
  }
}
