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
  CriticalRoleDeactivationException,
  DuplicateRoleNameException,
  ProtectedCapabilityRemovalException,
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

  describe('updatePermissions - Invariant Protection & Auditing', () => {
    it('should throw ProtectedCapabilityRemovalException and record audit event when protected capability is omitted', async () => {
      const systemRole = new Role();
      systemRole.id = 'role-admin';
      systemRole.name = 'Built-in Administrator';
      systemRole.type = RoleType.SYSTEM;
      systemRole.systemRoleKey = SystemRoleKey.ADMINISTRATOR;
      systemRole.tenantCode = 'tenant-01';

      const perm1 = new RolePermission();
      perm1.permissionCode = 'role.view';
      perm1.isProtected = true;

      const perm2 = new RolePermission();
      perm2.permissionCode = 'location.view';
      perm2.isProtected = true;

      systemRole.permissions = [perm1, perm2];
      mockRoleRepository.findById.mockResolvedValue(systemRole);

      // Attempt update with only role.view (omitting protected location.view)
      await expect(
        service.updatePermissions('role-admin', {
          permissionCodes: ['role.view'],
        }),
      ).rejects.toThrow(ProtectedCapabilityRemovalException);

      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_PROTECTED_CAPABILITY_VIOLATION,
          sanitizedPayload: expect.objectContaining({
            roleId: 'role-admin',
            omittedProtectedCapabilities: ['location.view'],
          }),
        }),
      );

      expect(mockRolePermissionRepository.deleteNonProtectedByRoleId).not.toHaveBeenCalled();
    });

    it('should throw if PermissionDependencyService detects dependency violation', async () => {
      mockPermissionDependencyService.validatePermissionSet.mockReturnValue({
        isValid: false,
        errors: ['location.update requires location.view'],
      });

      await expect(
        service.updatePermissions('role-123', {
          permissionCodes: ['location.update'],
        }),
      ).rejects.toThrow(/Capability dependency validation failed/);
    });

    it('should successfully update permissions, increment version, and sync cache', async () => {
      const role = new Role();
      role.id = 'role-emp';
      role.name = 'Employee';
      role.type = RoleType.SYSTEM;
      role.tenantCode = 'tenant-01';
      role.version = 1;

      const permProtected = new RolePermission();
      permProtected.permissionCode = 'employee.view';
      permProtected.isProtected = true;

      role.permissions = [permProtected];
      mockRoleRepository.findById.mockResolvedValue(role);

      const result = await service.updatePermissions('role-emp', {
        permissionCodes: ['employee.view', 'location.view'],
      });

      expect(result.role).toBeDefined();
      expect(mockRolePermissionRepository.deleteNonProtectedByRoleId).toHaveBeenCalledWith(
        'role-emp',
      );
      expect(mockRolePermissionRepository.bulkSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            permissionCode: 'location.view',
            isProtected: false,
          }),
        ]),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_PERMISSIONS_UPDATED,
        }),
      );
    });

    it('should prompt for confirmation when high-impact threshold is reached without explicit flag', async () => {
      mockRoleRepository.countAssignedUsers.mockResolvedValue(100);

      const result = await service.updatePermissions('role-high', {
        permissionCodes: ['employee.view'],
        confirmedHighImpact: false,
      });

      expect(result.confirmationRequired).toBe(true);
      expect(result.affectedUserCount).toBe(100);
      expect(mockRoleRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('renameRole', () => {
    it('should throw DuplicateRoleNameException if new name conflicts with existing role in tenant', async () => {
      const role = new Role();
      role.id = 'role-1';
      role.name = 'Employee';
      role.tenantCode = 'tenant-01';

      const conflictingRole = new Role();
      conflictingRole.id = 'role-2';
      conflictingRole.name = 'Team Member';
      conflictingRole.tenantCode = 'tenant-01';

      mockRoleRepository.findById.mockResolvedValue(role);
      mockRoleRepository.findByName.mockResolvedValue(conflictingRole);

      await expect(
        service.renameRole('role-1', {
          name: 'Team Member',
        }),
      ).rejects.toThrow(DuplicateRoleNameException);
    });

    it('should rename role, increment version, emit role.renamed and sync cache', async () => {
      const role = new Role();
      role.id = 'role-1';
      role.name = 'Employee';
      role.type = RoleType.SYSTEM;
      role.systemRoleKey = SystemRoleKey.EMPLOYEE;
      role.tenantCode = 'tenant-01';
      role.version = 1;
      role.permissions = [];

      mockRoleRepository.findById.mockResolvedValue(role);
      mockRoleRepository.findByName.mockResolvedValue(null);

      const result = await service.renameRole('role-1', {
        name: 'Team Member',
      });

      expect(result.name).toBe('Team Member');
      expect(result.systemRoleKey).toBe(SystemRoleKey.EMPLOYEE);
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.ROLE_RENAMED,
          sanitizedPayload: expect.objectContaining({
            oldName: 'Employee',
            newName: 'Team Member',
          }),
        }),
      );
      expect(mockRoleCacheService.syncRole).toHaveBeenCalled();
    });
  });

  describe('updateRoleStatus', () => {
    it('should throw CriticalRoleDeactivationException when deactivating Built-in Administrator', async () => {
      const adminRole = new Role();
      adminRole.id = 'role-admin';
      adminRole.name = 'Built-in Administrator';
      adminRole.systemRoleKey = SystemRoleKey.ADMINISTRATOR;

      mockRoleRepository.findById.mockResolvedValue(adminRole);

      await expect(service.updateRoleStatus('role-admin', RoleStatus.INACTIVE)).rejects.toThrow(
        CriticalRoleDeactivationException,
      );
    });
  });
});
