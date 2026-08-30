import { ImpactAnalysisResultDto } from '../dto';
import { ImpactAnalysisController } from './impact-analysis.controller';
import { ImpactAnalysisService } from '../services/impact-analysis.service';

describe('ImpactAnalysisController', () => {
  let controller: ImpactAnalysisController;
  let serviceMock: jest.Mocked<ImpactAnalysisService>;

  beforeEach(() => {
    serviceMock = {
      previewRoleImpact: jest.fn(),
      previewUserGroupImpact: jest.fn(),
    } as unknown as jest.Mocked<ImpactAnalysisService>;

    controller = new ImpactAnalysisController(serviceMock);
  });

  it('should call previewRoleImpact', async () => {
    const mockResult: ImpactAnalysisResultDto = {
      targetType: 'ROLE',
      targetId: 'role-1',
      estimate: {
        usersGaining: 0,
        usersLosing: 0,
        totalAffected: 10,
        isHighImpact: false,
        threshold: 100,
        isEstimated: false,
      },
      coverageLoss: null,
      requiresConfirmation: false,
    };
    serviceMock.previewRoleImpact.mockResolvedValueOnce(mockResult);

    const res = await controller.previewRoleImpact('11111111-1111-1111-1111-111111111111', {
      permissionCodes: ['view'],
    });
    expect(res).toBe(mockResult);
    expect(serviceMock.previewRoleImpact).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      { permissionCodes: ['view'] },
    );
  });

  it('should call previewUserGroupImpact', async () => {
    const mockResult: ImpactAnalysisResultDto = {
      targetType: 'USER_GROUP',
      targetId: 'group-1',
      estimate: {
        usersGaining: 50,
        usersLosing: 10,
        totalAffected: 60,
        isHighImpact: false,
        threshold: 100,
        isEstimated: false,
      },
      coverageLoss: null,
      requiresConfirmation: false,
    };
    serviceMock.previewUserGroupImpact.mockResolvedValueOnce(mockResult);

    const res = await controller.previewUserGroupImpact('22222222-2222-2222-2222-222222222222', {});
    expect(res).toBe(mockResult);
    expect(serviceMock.previewUserGroupImpact).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
      {},
    );
  });
});
