import { Test, TestingModule } from '@nestjs/testing';

import { InvitationController } from './invitation.controller';
import { InvitationApplicationService } from '../services/invitation.application.service';

describe('InvitationController', () => {
  let controller: InvitationController;
  let mockInvitationService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockInvitationService = {
      validateInvitation: jest.fn(),
      acceptInvitation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationController],
      providers: [{ provide: InvitationApplicationService, useValue: mockInvitationService }],
    }).compile();

    controller = module.get<InvitationController>(InvitationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validate', () => {
    it('should validate token and return payload', async () => {
      const expectedResult = {
        valid: true,
        userId: 'user-uuid',
        email: 'employee@tenant.com',
        tenantCode: 'tenant-123',
      };
      mockInvitationService.validateInvitation.mockResolvedValue(expectedResult);

      const result = await controller.validate({ token: 'raw-token' });
      expect(result).toEqual(expectedResult);
      expect(mockInvitationService.validateInvitation).toHaveBeenCalledWith('raw-token');
    });
  });

  describe('accept', () => {
    it('should accept invitation and return success status', async () => {
      const expectedResult = { success: true, userId: 'user-uuid' };
      mockInvitationService.acceptInvitation.mockResolvedValue(expectedResult);

      const result = await controller.accept({
        token: 'raw-token',
        password: 'ValidPassword123!',
      });
      expect(result).toEqual(expectedResult);
      expect(mockInvitationService.acceptInvitation).toHaveBeenCalledWith({
        token: 'raw-token',
        password: 'ValidPassword123!',
      });
    });
  });
});
