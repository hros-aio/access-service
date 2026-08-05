import { Body, Controller, Get, Headers, Patch } from '@nestjs/common';

import {
  AuthenticationSettingsResponseDto,
  UpdateAuthenticationSettingsDto,
} from '../dto/authentication-settings.dto';
import { AuthenticationSettingsService } from '../services/authentication-settings.service';

@Controller('admin/settings/authentication')
export class AuthenticationSettingsController {
  constructor(private readonly service: AuthenticationSettingsService) {}

  @Get()
  async getSettings(
    @Headers('x-tenant-code') tenantCode: string,
  ): Promise<AuthenticationSettingsResponseDto> {
    return this.service.getSettings(tenantCode);
  }

  @Patch()
  async updateSettings(
    @Headers('x-tenant-code') tenantCode: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateAuthenticationSettingsDto,
  ): Promise<AuthenticationSettingsResponseDto> {
    return this.service.updateSettings(tenantCode, dto, userId || 'system');
  }
}
