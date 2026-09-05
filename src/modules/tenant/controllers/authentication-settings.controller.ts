import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
  AuthenticationSettingsResponseDto,
  UpdateAuthenticationSettingsDto,
} from '../dto/authentication-settings.dto';
import { AuthenticationSettingsService } from '../services/authentication-settings.service';

@ApiTags('Authentication Settings')
@Controller('settings/authentication')
export class AuthenticationSettingsController {
  constructor(private readonly service: AuthenticationSettingsService) {}

  @Get()
  async getSettings(): Promise<AuthenticationSettingsResponseDto> {
    const settings = await this.service.getSettings();
    return AuthenticationSettingsResponseDto.fromSetting(settings);
  }

  @Put()
  async updateSettings(
    @Body() dto: UpdateAuthenticationSettingsDto,
  ): Promise<AuthenticationSettingsResponseDto> {
    const settings = await this.service.upsertSettings(dto);
    return AuthenticationSettingsResponseDto.fromSetting(settings);
  }
}
