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
