import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';

import { MfaController } from './mfa.controller';
import { MfaFactorStatus, MfaFactorType } from '../entities/mfa-method.entity';
import { MfaApplicationService } from '../services/mfa_application.service';

describe('MfaController', () => {
  let controller: MfaController;
  let service: jest.Mocked<MfaApplicationService>;

  beforeEach(async () => {
    service = {
      initiateEnrollment: jest.fn(),
      verifyAndActivateFactor: jest.fn(),
      verifyLoginChallenge: jest.fn(),
    } as unknown as jest.Mocked<MfaApplicationService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [{ provide: MfaApplicationService, useValue: service }],
    }).compile();

    controller = module.get<MfaController>(MfaController);
  });

  it('should initiate enrollment', async () => {
    const expectedResult = {
      factorId: 'f1',
      factorType: MfaFactorType.TOTP,
      status: MfaFactorStatus.PENDING,
    };
    service.initiateEnrollment.mockResolvedValue(expectedResult);

    const dto = { factorType: MfaFactorType.TOTP };
    const result = await controller.initiateEnrollment(dto);

    expect(service.initiateEnrollment).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });

  it('should verify enrollment', async () => {
    const expectedResult = {
      status: MfaFactorStatus.ACTIVE,
      isPrimary: true,
      enrolledAt: new Date(),
    };
    service.verifyAndActivateFactor.mockResolvedValue(expectedResult);

    const dto = {
      factorId: '00000000-0000-0000-0000-000000000001',
      factorType: MfaFactorType.TOTP,
      code: '123456',
    };
    const result = await controller.verifyEnrollment(dto);

    expect(service.verifyAndActivateFactor).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });

  it('should verify login challenge and set refresh token cookie', async () => {
    service.verifyLoginChallenge.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    const mockResponse = {
      cookie: jest.fn(),
    } as unknown as Response;

    const dto = { challengeId: '00000000-0000-0000-0000-000000000002', code: '123456' };
    const result = await controller.verifyChallenge(dto, mockResponse);

    expect(service.verifyLoginChallenge).toHaveBeenCalledWith(dto);
    expect(mockResponse.cookie).toHaveBeenCalledWith('__Host-refresh-token', 'rt', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(result).toEqual({ accessToken: 'at' });
  });
});
