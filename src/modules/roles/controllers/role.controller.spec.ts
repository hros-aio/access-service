import { Test, TestingModule } from '@nestjs/testing';

import { RoleController } from './role.controller';
import { RoleResponseDto } from '../dto/role.dto';
import { RoleStatus, RoleType } from '../interfaces/system-role-template.interface';
import { RoleApplicationService } from '../services/role.application.service';

describe('RoleController', () => {
  let controller: RoleController;
  let mockRoleApplicationService: Partial<Record<keyof RoleApplicationService, jest.Mock>>;

  beforeEach(async () => {
    mockRoleApplicationService = {
      list: jest.fn(),
      getById: jest.fn(),
      createCustom: jest.fn(),
      copy: jest.fn(),
      estimateImpact: jest.fn(),
      updateCustom: jest.fn(),
      updatePermissions: jest.fn(),
      deactivate: jest.fn(),
      reactivate: jest.fn(),
      rename: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [
        {
          provide: RoleApplicationService,
          useValue: mockRoleApplicationService,
        },
      ],
    }).compile();

    controller = module.get<RoleController>(RoleController);
  });

  describe('updateRolePermissions', () => {
    it('should delegate to roleApplicationService.updatePermissions', async () => {
      const mockResult = {
        role: {
          id: 'role-1',
          name: 'Custom Admin',
          tenantCode: 'TENANT_01',
          type: RoleType.CUSTOM,
          status: RoleStatus.ACTIVE,
          version: 2,
          permissions: [{ permissionCode: 'users.read', isProtected: false }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as RoleResponseDto,
      };

      mockRoleApplicationService.updatePermissions!.mockResolvedValue(mockResult);

      const result = await controller.updateRolePermissions('role-1', {
        permissionCodes: ['users.read'],
        version: 1,
      });

      expect(mockRoleApplicationService.updatePermissions).toHaveBeenCalledWith('role-1', {
        permissionCodes: ['users.read'],
        version: 1,
      });
      expect(result).toEqual(mockResult);
    });
  });
});
