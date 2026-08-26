import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { RoleCacheService } from './role-cache.service';
import { RoleApplicationService } from './role.application.service';
import { EventType } from '../../../enums';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { PermissionDependencyService } from '../../permissions';
import { RolePermission } from '../entities/role-permission.entity';
import { Role } from '../entities/role.entity';
import {
  CannotDeleteSystemRoleException,
  CannotMutateSystemRoleException,
  DuplicateRoleNameException,
  RoleNotFoundException,
  RoleVersionConflictException,
} from '../exceptions/role.exceptions';
import { RoleStatus, RoleType, SystemRoleKey } from '../interfaces/system-role-template.interface';
import { RolePermissionRepository } from '../repositories/role-permission.repository';
import { RoleRepository } from '../repositories/role.repository';

describe('RoleApplicationService', () => {
  let service: RoleApplicationService;
  let mockRoleRepository: {
    findAllByTenant: jest.Mock;
    findById: jest.Mock;
    findByName: jest.Mock;
    countAssignedUsers: jest.Mock;
    countActiveUserReach: jest.Mock;
    countAssignedUserGroups: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let mockRolePermissionRepository: {
    deleteNonProtectedByRoleId: jest.Mock;
    bulkSave: jest.Mock;
    deleteByRoleId: jest.Mock;
  };
  let mockRoleCacheService: {
    syncRole: jest.Mock;
    invalidateRole: jest.Mock;
  };
  let mockPermissionDependencyService: {
    validatePermissionSet: jest.Mock;
  };
  let mockOutboxRepository: {
    save: jest.Mock;
  };
  let mockTransactionService: {
    runInTransaction: jest.Mock;
  };

  beforeEach(async () => {
    mockRoleRepository = {
      findAllByTenant: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findByName: jest.fn().mockResolvedValue(null),
      countAssignedUsers: jest.fn().mockResolvedValue(0),
      countActiveUserReach: jest.fn().mockResolvedValue(0),
      countAssignedUserGroups: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((r) => r),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockRolePermissionRepository = {
      deleteNonProtectedByRoleId: jest.fn().mockResolvedValue(undefined),
      bulkSave: jest.fn().mockResolvedValue([]),
      deleteByRoleId: jest.fn().mockResolvedValue(undefined),
    };
    mockRoleCacheService = {
      syncRole: jest.fn().mockResolvedValue(undefined),
      invalidateRole: jest.fn().mockResolvedValue(undefined),
    };
    mockPermissionDependencyService = {
      validatePermissionSet: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };
    mockOutboxRepository = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleApplicationService,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: RoleRepository, useValue: mockRoleRepository },
        { provide: RolePermissionRepository, useValue: mockRolePermissionRepository },
        { provide: RoleCacheService, useValue: mockRoleCacheService },
        { provide: PermissionDependencyService, useValue: mockPermissionDependencyService },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = module.get<RoleApplicationService>(RoleApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCustomRole (US1)', () => {
    it('should create a custom role, persist permissions with is_protected=false, seed cache, and emit outbox event', async () => {
      mockRoleRepository.findByName.mockResolvedValue(null);
      mockRoleRepository.findById.mockImplementation((id) =>
        Promise.resolve({
          id,
          name: 'HR Specialist',
          type: RoleType.CUSTOM,
          status: RoleStatus.ACTIVE,
          version: 1,
          tenantCode: 'tenant-01',
          permissions: [
            { permissionCode: 'employee.view', isProtected: false },
            { permissionCode: 'employee.update', isProtected: false },
          ],
        }),
      );

      const result = await service.createCustomRole({
        name: 'HR Specialist',
        description: 'Specialist handling employees',
        permissionCodes: ['employee.view', 'employee.update'],
      });

      expect(result.name).toBe('HR Specialist');
      expect(result.type).toBe(RoleType.CUSTOM);
      expect(result.version).toBe(1);
      expect(result.isUnassigned).toBe(true);
      expect(mockRolePermissionRepository.bulkSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ permissionCode: 'employee.view', isProtected: false }),
          expect.objectContaining({ permissionCode: 'employee.update', isProtected: false }),
        ]),
      );
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_CREATED,
        }),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
    });

    it('should reject creation if capability dependencies are invalid', async () => {
      mockPermissionDependencyService.validatePermissionSet.mockReturnValue({
        isValid: false,
        errors: ['employee.update requires employee.view'],
      });

      await expect(
        service.createCustomRole({
          name: 'HR Specialist',
          permissionCodes: ['employee.update'],
        }),
      ).rejects.toThrow(/Capability dependency validation failed/);
    });

    it('should reject creation if role name is duplicate in tenant', async () => {
      mockRoleRepository.findByName.mockResolvedValue({ id: 'existing-id', name: 'HR Specialist' });

      await expect(
        service.createCustomRole({
          name: 'HR Specialist',
          permissionCodes: ['employee.view'],
        }),
      ).rejects.toThrow(DuplicateRoleNameException);
    });
  });

  describe('copyRole (US2)', () => {
    it('should clone a System Role to a Custom Role with is_protected reset to false', async () => {
      const systemRole = new Role();
      systemRole.id = 'sys-admin';
      systemRole.name = 'Built-in Administrator';
      systemRole.type = RoleType.SYSTEM;
      systemRole.systemRoleKey = SystemRoleKey.ADMINISTRATOR;
      systemRole.permissions = [
        { permissionCode: 'employee.view', isProtected: true } as RolePermission,
        { permissionCode: 'employee.delete', isProtected: true } as RolePermission,
      ];

      mockRoleRepository.findById.mockResolvedValue(systemRole);
      mockRoleRepository.findByName.mockResolvedValue(null);

      const result = await service.copyRole('sys-admin', {
        name: 'Custom Admin',
        description: 'Cloned from Admin',
      });

      expect(result).toBeDefined();
      expect(mockRolePermissionRepository.bulkSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ permissionCode: 'employee.view', isProtected: false }),
          expect.objectContaining({ permissionCode: 'employee.delete', isProtected: false }),
        ]),
      );
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_COPIED,
          sanitizedPayload: expect.objectContaining({
            sourceRoleId: 'sys-admin',
          }),
        }),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
    });

    it('should throw RoleNotFoundException if source role does not exist in tenant', async () => {
      mockRoleRepository.findById.mockResolvedValue(null);

      await expect(
        service.copyRole('missing-role', {
          name: 'New Custom Role',
        }),
      ).rejects.toThrow(RoleNotFoundException);
    });
  });

  describe('updateCustomRole (US3)', () => {
    it('should block mutation of System Roles via custom role endpoint', async () => {
      const systemRole = new Role();
      systemRole.id = 'sys-1';
      systemRole.name = 'Manager';
      systemRole.type = RoleType.SYSTEM;

      mockRoleRepository.findById.mockResolvedValue(systemRole);

      await expect(
        service.updateCustomRole('sys-1', {
          name: 'Updated Manager',
          version: 1,
          permissionCodes: ['employee.view'],
        }),
      ).rejects.toThrow(CannotMutateSystemRoleException);
    });

    it('should throw RoleVersionConflictException on optimistic concurrency mismatch', async () => {
      const customRole = new Role();
      customRole.id = 'cust-1';
      customRole.name = 'Specialist';
      customRole.type = RoleType.CUSTOM;
      customRole.version = 3;

      mockRoleRepository.findById.mockResolvedValue(customRole);

      await expect(
        service.updateCustomRole('cust-1', {
          name: 'Specialist',
          version: 2, // Stale version
          permissionCodes: ['employee.view'],
        }),
      ).rejects.toThrow(RoleVersionConflictException);
    });

    it('should estimate reach metrics accurately in estimateImpact', async () => {
      const role = new Role();
      role.id = 'role-1';
      mockRoleRepository.findById.mockResolvedValue(role);
      mockRoleRepository.countActiveUserReach.mockResolvedValue(45);
      mockRoleRepository.countAssignedUserGroups.mockResolvedValue(2);

      const impact = await service.estimateImpact('role-1');

      expect(impact.roleId).toBe('role-1');
      expect(impact.activeUserReachCount).toBe(45);
      expect(impact.assignedUserGroupCount).toBe(2);
      expect(impact.isUnassigned).toBe(false);
    });
  });

  describe('deactivateRole & reactivateRole (US4)', () => {
    it('should require confirmation when deactivating role assigned to user groups', async () => {
      const customRole = new Role();
      customRole.id = 'role-assigned';
      customRole.name = 'Assigned Role';
      customRole.type = RoleType.CUSTOM;
      customRole.status = RoleStatus.ACTIVE;

      mockRoleRepository.findById.mockResolvedValue(customRole);
      mockRoleRepository.countAssignedUserGroups.mockResolvedValue(3);
      mockRoleRepository.countActiveUserReach.mockResolvedValue(80);

      const result = await service.deactivateRole('role-assigned', { confirmed: false });

      expect(result.confirmationRequired).toBe(true);
      expect(result.affectedUserGroupCount).toBe(3);
      expect(result.affectedUserCount).toBe(80);
      expect(mockRoleRepository.save).not.toHaveBeenCalled();
    });

    it('should deactivate role when confirmed, update version, and sync cache', async () => {
      const customRole = new Role();
      customRole.id = 'role-assigned';
      customRole.name = 'Assigned Role';
      customRole.type = RoleType.CUSTOM;
      customRole.status = RoleStatus.ACTIVE;
      customRole.version = 1;

      mockRoleRepository.findById.mockResolvedValue(customRole);
      mockRoleRepository.countAssignedUserGroups.mockResolvedValue(1);
      mockRoleRepository.countActiveUserReach.mockResolvedValue(10);

      const result = await service.deactivateRole('role-assigned', { confirmed: true });

      expect(result.role?.status).toBe(RoleStatus.INACTIVE);
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_DEACTIVATED,
        }),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
    });

    it('should reactivate a deactivated role, increment version, and sync cache', async () => {
      const customRole = new Role();
      customRole.id = 'role-deactivated';
      customRole.name = 'Custom Role';
      customRole.type = RoleType.CUSTOM;
      customRole.status = RoleStatus.INACTIVE;
      customRole.version = 2;

      mockRoleRepository.findById.mockResolvedValue(customRole);

      const result = await service.reactivateRole('role-deactivated');

      expect(result.status).toBe(RoleStatus.ACTIVE);
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_REACTIVATED,
        }),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
    });
  });

  describe('listRoles & getRoleById (US5)', () => {
    it('should enrich role list with isUnassigned and reach count', async () => {
      const role1 = new Role();
      role1.id = 'r1';
      role1.name = 'Unassigned Role';

      const role2 = new Role();
      role2.id = 'r2';
      role2.name = 'Assigned Role';

      mockRoleRepository.findAllByTenant.mockResolvedValue([role1, role2]);
      mockRoleRepository.countAssignedUserGroups.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
      mockRoleRepository.countActiveUserReach.mockResolvedValueOnce(0).mockResolvedValueOnce(35);

      const list = await service.listRoles();

      expect(list).toHaveLength(2);
      expect(list[0].isUnassigned).toBe(true);
      expect(list[0].activeUserReachCount).toBe(0);
      expect(list[1].isUnassigned).toBe(false);
      expect(list[1].activeUserReachCount).toBe(35);
    });
  });

  describe('deleteRole', () => {
    it('should throw CannotDeleteSystemRoleException if role is of type SYSTEM', async () => {
      const systemRole = new Role();
      systemRole.id = 'role-123';
      systemRole.name = 'Employee';
      systemRole.type = RoleType.SYSTEM;

      mockRoleRepository.findById.mockResolvedValue(systemRole);

      await expect(service.deleteRole('role-123')).rejects.toThrow(CannotDeleteSystemRoleException);
      expect(mockRoleRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete custom role and invalidate cache', async () => {
      const customRole = new Role();
      customRole.id = 'role-456';
      customRole.name = 'Contractor';
      customRole.type = RoleType.CUSTOM;
      customRole.tenantCode = 'tenant-01';

      mockRoleRepository.findById.mockResolvedValue(customRole);

      await service.deleteRole('role-456');

      expect(mockRolePermissionRepository.deleteByRoleId).toHaveBeenCalledWith('role-456');
      expect(mockRoleRepository.delete).toHaveBeenCalledWith('role-456');
      expect(mockRoleCacheService.invalidateRole).toHaveBeenCalled();
    });
  });
});
