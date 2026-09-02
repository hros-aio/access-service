import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { BootstrapCapabilitiesResponseDto } from '../dto/bootstrap-capabilities-response.dto';
import { BootstrapAuthorizationService } from '../services/bootstrap-authorization.service';

@ApiTags('Authorization')
@Controller('auth/bootstrap')
export class BootstrapAuthorizationController {
  constructor(private readonly bootstrapService: BootstrapAuthorizationService) {}

  @Get('capabilities')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get session bootstrap authorization capabilities',
    description:
      'Resolves and returns cumulative deduplicated permissions, authorized navigation modules, and current authorizationVersion for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User cumulative capabilities successfully resolved',
    type: BootstrapCapabilitiesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Authorization store unavailable' })
  async getCapabilities(): Promise<BootstrapCapabilitiesResponseDto> {
    return this.bootstrapService.getBootstrapCapabilities();
  }
}
