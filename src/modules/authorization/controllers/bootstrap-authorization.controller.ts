import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { BootstrapCapabilitiesResponseDto } from '../dto/bootstrap-capabilities-response.dto';
import { BootstrapAuthorizationService } from '../services/bootstrap-authorization.service';

interface AuthenticatedRequest extends Request {
  tenantCode?: string;
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
    employeeId?: string;
    tenantCode?: string;
  };
}

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
  async getCapabilities(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: boolean; data: BootstrapCapabilitiesResponseDto }> {
    const tenantCode =
      request.tenantCode ||
      (request.headers['x-tenant-code'] as string) ||
      request.user?.tenantCode;
    const userId =
      request.user?.id ||
      request.user?.userId ||
      request.user?.sub ||
      (request.headers['x-user-id'] as string);

    if (!tenantCode || !userId) {
      throw new UnauthorizedException('Authentication context is missing or invalid.');
    }

    const data = await this.bootstrapService.getBootstrapCapabilities(tenantCode, userId);
    return {
      success: true,
      data,
    };
  }
}
