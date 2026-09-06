import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard, PermissionGuard } from '@new-hros/libs-apis';

import { AdminInvitationController } from './admin-invitation.controller';
import { InvitationApplicationService } from '../services/invitation.application.service';

describe('AdminInvitationController', () => {
  let controller: AdminInvitationController;
  let mockInvitationService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockInvitationService = {
      resendInvitation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminInvitationController],
      providers: [{ provide: InvitationApplicationService, useValue: mockInvitationService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminInvitationController>(AdminInvitationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('resend', () => {
    it('should successfully call resendInvitation service method and return output', async () => {
      const expectedResult = {
        success: true,
        invitationId: 'new-invite-uuid',
        rawToken: 'raw-token-abc',
        expiresAt: new Date(),
      };
      mockInvitationService.resendInvitation.mockResolvedValue(expectedResult);

      const result = await controller.resend('target-user-uuid');
      expect(result).toEqual(expectedResult);
      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith('target-user-uuid');
    });
  });
});
