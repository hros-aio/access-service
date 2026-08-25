import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { RoleController } from '../../src/modules/roles/controllers/role.controller';
import {
  RoleStatus,
  RoleType,
  SystemRoleKey,
} from '../../src/modules/roles/interfaces/system-role-template.interface';
import { RoleApplicationService } from '../../src/modules/roles/services/role.application.service';

describe('RoleController (E2E API)', () => {
  let app: INestApplication;
  let mockRoleApplicationService: {
    listRoles: jest.Mock;
    getRoleById: jest.Mock;
    renameRole: jest.Mock;
    updatePermissions: jest.Mock;
    updateRoleStatus: jest.Mock;
    deleteRole: jest.Mock;
  };

  beforeEach(async () => {
    mockRoleApplicationService = {
      listRoles: jest.fn().mockResolvedValue([
        {
          id: 'role-emp',
          tenantCode: 'tenant-01',
          name: 'Employee',
          type: RoleType.SYSTEM,
          systemRoleKey: SystemRoleKey.EMPLOYEE,
          status: RoleStatus.ACTIVE,
          version: 1,
          permissions: [{ permissionCode: 'employee.view', isProtected: true }],
          userCount: 20,
        },
      ]),
      getRoleById: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          tenantCode: 'tenant-01',
          name: 'Employee',
          type: RoleType.SYSTEM,
          systemRoleKey: SystemRoleKey.EMPLOYEE,
          status: RoleStatus.ACTIVE,
          version: 1,
          permissions: [{ permissionCode: 'employee.view', isProtected: true }],
          userCount: 20,
        }),
      ),
      renameRole: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          id,
          tenantCode: 'tenant-01',
          name: dto.name,
          type: RoleType.SYSTEM,
          systemRoleKey: SystemRoleKey.EMPLOYEE,
          status: RoleStatus.ACTIVE,
          version: 2,
          permissions: [{ permissionCode: 'employee.view', isProtected: true }],
        }),
      ),
      updatePermissions: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          role: {
            id,
            tenantCode: 'tenant-01',
            name: 'Employee',
            type: RoleType.SYSTEM,
            systemRoleKey: SystemRoleKey.EMPLOYEE,
            status: RoleStatus.ACTIVE,
            version: 2,
            permissions: dto.permissionCodes.map((code: string) => ({
              permissionCode: code,
              isProtected: code === 'employee.view',
            })),
          },
        }),
      ),
      updateRoleStatus: jest.fn().mockImplementation((id, status) =>
        Promise.resolve({
          id,
          tenantCode: 'tenant-01',
          name: 'Employee',
          type: RoleType.SYSTEM,
          status,
          version: 2,
          permissions: [],
        }),
      ),
      deleteRole: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [{ provide: RoleApplicationService, useValue: mockRoleApplicationService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /roles - should return list of roles with user count', async () => {
    const response = await request(app.getHttpServer()).get('/roles').expect(200);

    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBe(1);
    expect(response.body[0].name).toBe('Employee');
    expect(response.body[0].userCount).toBe(20);
  });

  it('GET /roles/:roleId - should return role details with protection flags', async () => {
    const response = await request(app.getHttpServer()).get('/roles/role-emp').expect(200);

    expect(response.body.id).toBe('role-emp');
    expect(response.body.permissions[0].isProtected).toBe(true);
  });

  it('PATCH /roles/:roleId/rename - should rename tenant-facing label', async () => {
    const response = await request(app.getHttpServer())
      .patch('/roles/role-emp/rename')
      .send({ name: 'Team Member' })
      .expect(200);

    expect(response.body.name).toBe('Team Member');
    expect(mockRoleApplicationService.renameRole).toHaveBeenCalledWith('role-emp', {
      name: 'Team Member',
    });
  });

  it('PUT /roles/:roleId/permissions - should update permissions', async () => {
    const response = await request(app.getHttpServer())
      .put('/roles/role-emp/permissions')
      .send({ permissionCodes: ['employee.view', 'location.view'] })
      .expect(200);

    expect(response.body.role.permissions.length).toBe(2);
    expect(mockRoleApplicationService.updatePermissions).toHaveBeenCalledWith('role-emp', {
      permissionCodes: ['employee.view', 'location.view'],
    });
  });

  it('DELETE /roles/:roleId - should invoke delete handler', async () => {
    const response = await request(app.getHttpServer()).delete('/roles/role-custom').expect(200);

    expect(response.body.success).toBe(true);
    expect(mockRoleApplicationService.deleteRole).toHaveBeenCalledWith('role-custom');
  });
});
