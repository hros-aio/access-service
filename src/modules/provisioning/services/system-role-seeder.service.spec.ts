import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { SystemRoleSeederService } from './system-role-seeder.service';
import { RoleType, SystemRoleKey } from '../../roles/interfaces/system-role-template.interface';
import { RolePermissionRepository } from '../../roles/repositories/role-permission.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { RoleCacheService } from '../../roles/services/role-cache.service';

describe('SystemRoleSeederService', () => {
  let service: SystemRoleSeederService;
  let mockRoleRepository: { findBySystemKey: jest.Mock; save: jest.Mock };
  let mockRolePermissionRepository: { bulkSave: jest.Mock };
  let mockRoleCacheService: { syncRole: jest.Mock };
  let mockTransactionService: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    mockRoleRepository = {
      findBySystemKey: jest.fn().mockResolvedValue(null),
      save: jest
        .fn()
        .mockImplementation((role) => ({ id: `role-uuid-${role.systemRoleKey}`, ...role })),
    };
    mockRolePermissionRepository = {
      bulkSave: jest.fn().mockResolvedValue([]),
    };
    mockRoleCacheService = {
      syncRole: jest.fn().mockResolvedValue(undefined),
    };
    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemRoleSeederService,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: RoleRepository, useValue: mockRoleRepository },
        { provide: RolePermissionRepository, useValue: mockRolePermissionRepository },
        { provide: RoleCacheService, useValue: mockRoleCacheService },
      ],
    }).compile();

    service = module.get<SystemRoleSeederService>(SystemRoleSeederService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should seed all default system roles with protected capability flags and sync cache', async () => {
    const tenantCode = 'tenant-test-01';
    const seeded = await service.seedBaselineSystemRoles(tenantCode);

    expect(seeded.length).toBe(3);
    expect(mockRoleRepository.save).toHaveBeenCalledTimes(3);
    expect(mockRolePermissionRepository.bulkSave).toHaveBeenCalledTimes(3);
    expect(mockRoleCacheService.syncRole).toHaveBeenCalledTimes(3);

    const employeeRole = seeded.find((r) => r.systemRoleKey === SystemRoleKey.EMPLOYEE);
    expect(employeeRole).toBeDefined();
    expect(employeeRole?.type).toBe(RoleType.SYSTEM);
    expect(employeeRole?.name).toBe('Employee');

    const adminRole = seeded.find((r) => r.systemRoleKey === SystemRoleKey.ADMINISTRATOR);
    expect(adminRole).toBeDefined();
    expect(
      adminRole?.permissions?.some((p) => p.permissionCode === 'role.view' && p.isProtected),
    ).toBe(true);
  });

  it('should skip creation if role already exists for tenant', async () => {
    const tenantCode = 'tenant-test-02';
    mockRoleRepository.findBySystemKey.mockResolvedValueOnce({
      id: 'existing-role-id',
      tenantCode,
      systemRoleKey: SystemRoleKey.EMPLOYEE,
      name: 'Custom Employee Name',
      type: RoleType.SYSTEM,
      permissions: [],
    });

    const seeded = await service.seedBaselineSystemRoles(tenantCode);

    expect(seeded.length).toBe(3);
    expect(mockRoleRepository.save).toHaveBeenCalledTimes(2);
  });
});
