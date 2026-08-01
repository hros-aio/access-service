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
      const actor = {
        sub: 'admin-uuid',
        sid: 'session-uuid',
        tenantCode: 'tenant-123',
        type: 'access' as const,
      };
      const expectedResult = {
        success: true,
        invitationId: 'new-invite-uuid',
        rawToken: 'raw-token-abc',
        expiresAt: new Date(),
      };
      mockInvitationService.resendInvitation.mockResolvedValue(expectedResult);

      const result = await controller.resend(actor, 'target-user-uuid');
      expect(result).toEqual(expectedResult);
      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith(
        {
          userId: 'admin-uuid',
          tenantCode: 'tenant-123',
          userType: 'admin',
        },
        'target-user-uuid',
      );
    });

    it('should default missing actor fields to empty string', async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const actor = {
        type: 'access' as const,
        sid: 'session-uuid',
      } as any;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      mockInvitationService.resendInvitation.mockResolvedValue({ success: true });

      await controller.resend(actor, 'target-user-uuid');
      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith(
        {
          userId: '',
          tenantCode: '',
          userType: 'admin',
        },
        'target-user-uuid',
      );
    });
  });
});
