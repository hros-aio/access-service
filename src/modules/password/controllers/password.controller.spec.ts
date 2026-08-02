import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard, PermissionGuard } from '@new-hros/libs-apis';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { Request } from 'express';

import { PasswordController } from './password.controller';
import { RestrictedSessionGuard } from '../guards/restricted-session.guard';
import { PasswordService } from '../services/password.service';

type CustomRequest = Request & { session?: { userId: string; tenantCode: string; flowId: string } };

describe('PasswordController', () => {
  let controller: PasswordController;
  let mockPasswordService: Record<string, jest.Mock>;
  let mockRedisCacheProvider: Record<string, unknown>;

  beforeEach(async () => {
    mockPasswordService = {
      setupPasswordViaSsoFallback: jest.fn(),
      requestResetCode: jest.fn(),
      verifyResetCode: jest.fn(),
      confirmPasswordReset: jest.fn(),
      adminInitiateReset: jest.fn(),
    };

    mockRedisCacheProvider = {
      client: {},
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PasswordController],
      providers: [
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        RestrictedSessionGuard,
      ],
    })
      .overrideGuard(RestrictedSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PasswordController>(PasswordController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestReset', () => {
    it('should delegate requestReset to PasswordService', async () => {
      const dto = { tenantCode: 't-1', email: 'user@example.com' };
      const expected = { message: 'If an active account exists...' };
      mockPasswordService.requestResetCode.mockResolvedValue(expected);

      const res = await controller.requestReset(dto);
      expect(res).toEqual(expected);
      expect(mockPasswordService.requestResetCode).toHaveBeenCalledWith(dto);
    });
  });

  describe('verifyCode', () => {
    it('should delegate verifyCode to PasswordService', async () => {
      const dto = { challengeId: 'c-1', tenantCode: 't-1', userId: 'u-1', code: '123456' };
      const expected = { valid: true, resetToken: 'token-123' };
      mockPasswordService.verifyResetCode.mockResolvedValue(expected);

      const res = await controller.verifyCode(dto);
      expect(res).toEqual(expected);
      expect(mockPasswordService.verifyResetCode).toHaveBeenCalledWith(dto);
    });
  });

  describe('confirmReset', () => {
    it('should delegate confirmReset to PasswordService', async () => {
      const dto = {
        challengeId: 'c-1',
        tenantCode: 't-1',
        userId: 'u-1',
        resetToken: 'token-123',
        newPassword: 'NewPassword123!',
      };
      const expected = { success: true };
      mockPasswordService.confirmPasswordReset.mockResolvedValue(expected);

      const res = await controller.confirmReset(dto);
      expect(res).toEqual(expected);
      expect(mockPasswordService.confirmPasswordReset).toHaveBeenCalledWith(dto);
    });
  });

  describe('adminInitiateReset', () => {
    it('should delegate adminInitiateReset to PasswordService', async () => {
      const dto = { tenantCode: 't-1', userId: 'u-1' };
      const expected = { message: 'Password reset workflow initiated for user.' };
      mockPasswordService.adminInitiateReset.mockResolvedValue(expected);

      const res = await controller.adminInitiateReset('u-1', dto);
      expect(res).toEqual(expected);
      expect(mockPasswordService.adminInitiateReset).toHaveBeenCalledWith({
        tenantCode: 't-1',
        userId: 'u-1',
      });
    });
  });

  describe('setupPassword', () => {
    it('should delegate password setup to the service', async () => {
      const mockReq = {
        session: {
          flowId: 'flow-123',
          tenantCode: 'tenant-123',
          userId: 'user-123',
        },
      } as unknown as CustomRequest;

      const mockDto = { password: 'SecurePassword123!' };
      const serviceResult = {
        mfaRequired: false,
        accessToken: 'token-abc',
        refreshToken: 'token-ref',
      };
      mockPasswordService.setupPasswordViaSsoFallback.mockResolvedValue(serviceResult);

      const result = await controller.setupPassword(mockReq, mockDto);

      expect(result).toEqual({
        status: 'success',
        data: serviceResult,
      });

      expect(mockPasswordService.setupPasswordViaSsoFallback).toHaveBeenCalledWith(
        'flow-123',
        'tenant-123',
        'user-123',
        mockDto,
      );
    });

    it('should throw an error if request session metadata is missing', async () => {
      const mockReq = {} as unknown as CustomRequest;
      const mockDto = { password: 'SecurePassword123!' };

      await expect(controller.setupPassword(mockReq, mockDto)).rejects.toThrow(
        'Session metadata not set by guard',
      );
    });
  });
});
