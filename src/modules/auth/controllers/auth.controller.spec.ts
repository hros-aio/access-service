/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthApplicationService } from '../services/auth.application.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      loginWithPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthApplicationService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call service and set refresh token cookie', async () => {
      const mockResult = {
        authState: 'AUTHENTICATED',
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
      };
      mockAuthService.loginWithPassword.mockResolvedValue(mockResult);

      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      const dto = {
        tenantCode: 'TENANT_123',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      };

      const result = await controller.login(dto, mockResponse);

      expect(mockAuthService.loginWithPassword).toHaveBeenCalledWith(dto);
      expect(mockResponse.cookie).toHaveBeenCalledWith('__Host-refresh-token', 'refresh-jwt', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(result).toEqual({
        authState: 'AUTHENTICATED',
        accessToken: 'access-jwt',
      });
    });

    it('should return MFA_REQUIRED and challengeId without setting cookie', async () => {
      const mockResult = {
        authState: 'MFA_REQUIRED',
        challengeId: 'mfa-challenge-uuid',
      };
      mockAuthService.loginWithPassword.mockResolvedValue(mockResult);

      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      const dto = {
        tenantCode: 'TENANT_123',
        email: 'mfa-employee@tenant.com',
        password: 'SecurePassword123!',
      };

      const result = await controller.login(dto, mockResponse);

      expect(mockAuthService.loginWithPassword).toHaveBeenCalledWith(dto);
      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        authState: 'MFA_REQUIRED',
        challengeId: 'mfa-challenge-uuid',
      });
    });
  });
});
