import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  CriteriaImpactResponseDto,
  DynamicMatchingRuleDto,
  MatchedMemberDto,
  PreviewMatchingResponseDto,
} from '../dto';
import { UserGroupPopulationQueryService } from '../services/user-group-population-query.service';

@ApiTags('Admin User Groups Population')
@ApiBearerAuth()
@Controller('user-groups')
export class UserGroupPopulationController {
  constructor(private readonly populationService: UserGroupPopulationQueryService) {}

  @Get(':id/members')
  @ApiOperation({ summary: 'Get materialized members belonging to a user group' })
  @ApiResponse({ status: 200, description: 'Paginated list of group members' })
  async getMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ data: MatchedMemberDto[]; total: number; page: number; limit: number }> {
    return this.populationService.getMatchingPopulation(id, page ? +page : 1, limit ? +limit : 20);
  }

  @Post('preview-matching')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview employee matching population for draft criteria' })
  @ApiResponse({ status: 200, type: PreviewMatchingResponseDto })
  async previewMatching(@Body() dto: DynamicMatchingRuleDto): Promise<PreviewMatchingResponseDto> {
    return this.populationService.previewCriteriaPopulation(dto);
  }

  @Post(':id/criteria-impact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimate member diff impact of a proposed matching rule change' })
  @ApiResponse({ status: 200, type: CriteriaImpactResponseDto })
  async estimateImpact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DynamicMatchingRuleDto,
  ): Promise<CriteriaImpactResponseDto> {
    return this.populationService.estimateCriteriaDiff(id, dto);
  }
}
