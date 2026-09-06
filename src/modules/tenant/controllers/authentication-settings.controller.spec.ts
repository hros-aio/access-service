import { Test, TestingModule } from '@nestjs/testing';

import { AuthenticationSettingsController } from './authentication-settings.controller';
import {
  AuthenticationSettingsResponseDto,
  UpdateAuthenticationSettingsDto,
} from '../dto/authentication-settings.dto';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';
import { AuthenticationSettingsService } from '../services/authentication-settings.service';

describe('AuthenticationSettingsController', () => {
  let controller: AuthenticationSettingsController;
  let service: jest.Mocked<AuthenticationSettingsService>;

  beforeEach(async () => {
    const mockService = {
      getSettings: jest.fn(),
      upsertSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthenticationSettingsController],
      providers: [{ provide: AuthenticationSettingsService, useValue: mockService }],
    }).compile();

    controller = module.get<AuthenticationSettingsController>(AuthenticationSettingsController);
    service = module.get(AuthenticationSettingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSettings', () => {
    it('should delegate to service.getSettings and return AuthenticationSettingsResponseDto', async () => {
      const mockSettings = {
        tenantCode: 'TENANT_123',
        restrictedMfaEnabled: true,
        needAdminResetPassword: false,
        accountLockoutEnabled: true,
        maxFailedRetries: 5,
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
        version: 1,
        updatedAt: new Date('2026-08-05T22:00:00.000Z'),
      } as unknown as AuthenticationSettings;

      service.getSettings.mockResolvedValue(mockSettings);

      const result = await controller.getSettings();

      expect(service.getSettings).toHaveBeenCalled();
      expect(result).toEqual(AuthenticationSettingsResponseDto.fromSetting(mockSettings));
    });
  });

  describe('updateSettings', () => {
    it('should delegate to service.upsertSettings and return AuthenticationSettingsResponseDto', async () => {
      const dto: UpdateAuthenticationSettingsDto = {
        mfaRequired: true,
        selfServicePasswordResetEnabled: true,
        lockoutEnabled: true,
        lockoutThreshold: 3,
        ipRestrictionEnabled: true,
        ipAllowList: ['192.168.1.0/24', '10.0.0.0/8'],
        version: 1,
      };

      const updatedSettings = {
        tenantCode: 'TENANT_123',
        restrictedMfaEnabled: true,
        needAdminResetPassword: true,
        accountLockoutEnabled: true,
        maxFailedRetries: 3,
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24', '10.0.0.0/8'],
        version: 2,
        updatedAt: new Date('2026-08-05T22:05:00.000Z'),
      } as unknown as AuthenticationSettings;

      service.upsertSettings.mockResolvedValue(updatedSettings);

      const result = await controller.updateSettings(dto);

      expect(service.upsertSettings).toHaveBeenCalledWith(dto);
      expect(result).toEqual(AuthenticationSettingsResponseDto.fromSetting(updatedSettings));
    });
  });
});
