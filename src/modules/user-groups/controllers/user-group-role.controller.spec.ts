import { UserGroupRoleController } from './user-group-role.controller';
import { UserGroupImpactService } from '../services/user-group-impact.service';
import { UserGroupRoleAssignmentService } from '../services/user-group-role-assignment.service';

describe('UserGroupRoleController', () => {
  let controller: UserGroupRoleController;
  let mockRoleAssignmentService: jest.Mocked<UserGroupRoleAssignmentService>;
  let mockImpactService: jest.Mocked<UserGroupImpactService>;

  beforeEach(() => {
    mockRoleAssignmentService = {
      getAssignedRoles: jest.fn(),
      updateRoleAssignments: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRoleAssignmentService>;

    mockImpactService = {
      estimateRoleAssignmentImpact: jest.fn(),
    } as unknown as jest.Mocked<UserGroupImpactService>;

    controller = new UserGroupRoleController(mockRoleAssignmentService, mockImpactService);
  });

  it('should delegate getAssignedRoles to service', async () => {
    const roles = [
      {
        id: 'role-1',
        name: 'Manager',
        type: 'CUSTOM',
        capabilityCount: 5,
        createdAt: new Date(),
      },
    ];
    mockRoleAssignmentService.getAssignedRoles.mockResolvedValue(roles);

    const result = await controller.getAssignedRoles('group-1');
    expect(result).toBe(roles);
    expect(mockRoleAssignmentService.getAssignedRoles).toHaveBeenCalledWith('group-1');
  });

  it('should delegate estimateImpact to impact service', async () => {
    const impact = {
      affectedUserCount: 25,
      zeroRoleUserCount: 0,
      requiresConfirmation: false,
      threshold: 100,
    };
    mockImpactService.estimateRoleAssignmentImpact.mockResolvedValue(impact);

    const result = await controller.estimateImpact('group-1', { roleIds: ['role-1'] });
    expect(result).toBe(impact);
    expect(mockImpactService.estimateRoleAssignmentImpact).toHaveBeenCalledWith('group-1', [
      'role-1',
    ]);
  });

  it('should delegate updateRoleAssignments to service', async () => {
    const roles = [
      {
        id: 'role-1',
        name: 'Manager',
        type: 'CUSTOM',
        capabilityCount: 0,
        createdAt: new Date(),
      },
    ];
    mockRoleAssignmentService.updateRoleAssignments.mockResolvedValue(roles);

    const dto = { roleIds: ['role-1'], expectedVersion: 2, confirmed: true };
    const result = await controller.updateRoleAssignments('group-1', dto);
    expect(result).toBe(roles);
    expect(mockRoleAssignmentService.updateRoleAssignments).toHaveBeenCalledWith('group-1', dto);
  });
});
