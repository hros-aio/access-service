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

  describe('listRoles', () => {
    it('should delegate to roleApplicationService.list with query parameters', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockRoleApplicationService.list!.mockResolvedValue(mockResult);

      const query = { page: 1, limit: 10, status: RoleStatus.ACTIVE };
      const result = await controller.listRoles(query);

      expect(mockRoleApplicationService.list).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getRoleById', () => {
    it('should delegate to roleApplicationService.getById', async () => {
      const mockRole = { id: 'role-1', name: 'Admin' } as RoleResponseDto;
      mockRoleApplicationService.getById!.mockResolvedValue(mockRole);

      const result = await controller.getRoleById('role-1');

      expect(mockRoleApplicationService.getById).toHaveBeenCalledWith('role-1');
      expect(result).toEqual(mockRole);
    });
  });

  describe('createCustomRole', () => {
    it('should delegate to roleApplicationService.createCustom', async () => {
      const dto = { name: 'Custom', permissionCodes: ['perm.1'] };
      const mockRole = { id: 'role-1', name: 'Custom' } as RoleResponseDto;
      mockRoleApplicationService.createCustom!.mockResolvedValue(mockRole);

      const result = await controller.createCustomRole(dto);

      expect(mockRoleApplicationService.createCustom).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockRole);
    });
  });

  describe('copyRole', () => {
    it('should delegate to roleApplicationService.copy', async () => {
      const dto = { name: 'Cloned Role' };
      const mockRole = { id: 'role-2', name: 'Cloned Role' } as RoleResponseDto;
      mockRoleApplicationService.copy!.mockResolvedValue(mockRole);

      const result = await controller.copyRole('role-1', dto);

      expect(mockRoleApplicationService.copy).toHaveBeenCalledWith('role-1', dto);
      expect(result).toEqual(mockRole);
    });
  });

  describe('estimateImpact', () => {
    it('should delegate to roleApplicationService.estimateImpact', async () => {
      const mockImpact = {
        roleId: 'role-1',
        assignedUserGroupCount: 1,
        activeUserReachCount: 10,
        isUnassigned: false,
      };
      mockRoleApplicationService.estimateImpact!.mockResolvedValue(mockImpact);

      const result = await controller.estimateImpact('role-1');

      expect(mockRoleApplicationService.estimateImpact).toHaveBeenCalledWith('role-1');
      expect(result).toEqual(mockImpact);
    });
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

  describe('deleteRole', () => {
    it('should delegate to roleApplicationService.delete', async () => {
      mockRoleApplicationService.delete!.mockResolvedValue(undefined);

      const result = await controller.deleteRole('role-1');

      expect(mockRoleApplicationService.delete).toHaveBeenCalledWith('role-1');
      expect(result).toEqual({ success: true });
    });
  });
});
