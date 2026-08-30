import { Test, TestingModule } from '@nestjs/testing';
import { RequestContext } from '@new-hros/libs-core';

import { MfaController } from './mfa.controller';
import { MfaFactorType } from '../dto/enroll_mfa.dto';
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

  it('should initiate enrollment using req user or fallbacks', async () => {
    service.initiateEnrollment.mockResolvedValue({
      factorId: 'f1',
      factorType: MfaFactorType.TOTP,
      status: 'pending',
    });

    const reqWithUser = {
      user: { tenantCode: 'tenant-abc', userId: 'user-xyz' },
    } as unknown as RequestContext;
    await controller.initiateEnrollment({ factorType: MfaFactorType.TOTP }, reqWithUser);
    expect(service.initiateEnrollment).toHaveBeenCalledWith('tenant-abc', 'user-xyz', {
      factorType: MfaFactorType.TOTP,
    });

    const reqWithoutUser = {} as unknown as RequestContext;
    await controller.initiateEnrollment({ factorType: MfaFactorType.TOTP }, reqWithoutUser);
    expect(service.initiateEnrollment).toHaveBeenCalledWith(
      'tenant-001',
      '00000000-0000-0000-0000-000000000001',
      { factorType: MfaFactorType.TOTP },
    );
  });

  it('should verify enrollment using req user or fallbacks', async () => {
    service.verifyAndActivateFactor.mockResolvedValue({
      status: 'active',
      isPrimary: true,
      enrolledAt: new Date(),
    });

    const dto = {
      factorId: '00000000-0000-0000-0000-000000000001',
      factorType: MfaFactorType.TOTP,
      code: '123456',
    };
    const reqWithUser = {
      user: { tenantCode: 't1', userId: 'u1' },
    } as unknown as RequestContext;
    await controller.verifyEnrollment(dto, reqWithUser);
    expect(service.verifyAndActivateFactor).toHaveBeenCalledWith('t1', 'u1', dto);

    const reqWithoutUser = {} as unknown as RequestContext;
    await controller.verifyEnrollment(dto, reqWithoutUser);
    expect(service.verifyAndActivateFactor).toHaveBeenCalledWith(
      'tenant-001',
      '00000000-0000-0000-0000-000000000001',
      dto,
    );
  });

  it('should verify login challenge using req user or fallbacks', async () => {
    service.verifyLoginChallenge.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
    });

    const dto = { challengeId: '00000000-0000-0000-0000-000000000002', code: '123456' };
    const reqWithUser = { user: { tenantCode: 't1', userId: 'u1' } } as unknown as RequestContext;
    await controller.verifyChallenge(dto, reqWithUser);
    expect(service.verifyLoginChallenge).toHaveBeenCalledWith('t1', 'u1', dto);

    const reqWithoutUser = {} as unknown as RequestContext;
    await controller.verifyChallenge(dto, reqWithoutUser);
    expect(service.verifyLoginChallenge).toHaveBeenCalledWith(
      'tenant-001',
      '00000000-0000-0000-0000-000000000001',
      dto,
    );
  });
});
