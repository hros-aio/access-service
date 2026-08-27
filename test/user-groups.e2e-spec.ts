import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { UserGroupAdminController } from '../src/modules/user-groups/controllers/user-group-admin.controller';
import { ScopeType, UserGroupStatus } from '../src/modules/user-groups/domain/enums';
import { UserGroupLifecycleService } from '../src/modules/user-groups/services/user-group-lifecycle.service';
import { UserGroupQueryService } from '../src/modules/user-groups/services/user-group-query.service';

describe('UserGroupAdminController (e2e)', () => {
  let app: INestApplication;
  const mockTenantCode = 'tenant-001';

  const mockUserGroupDetails = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    tenantCode: mockTenantCode,
    name: 'Engineering Staff',
    description: 'All engineering members',
    status: UserGroupStatus.ACTIVE,
    scopeType: ScopeType.DEPARTMENT,
    scopeRefId: 'dept-eng-01',
    matchingRule: {
      clauses: [
        { attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' },
        { attribute: 'departmentId', operator: 'EQUALS', value: 'dept-eng-01' },
      ],
    },
    ruleAttributeKeys: ['employmentStatus', 'departmentId'],
    version: 1,
    projectionVersion: 0,
    isPendingSync: true,
    hasNoAssignedRoles: true,
    assignedRoles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockLifecycleService: {
    createUserGroup: jest.Mock;
    updateUserGroup: jest.Mock;
    deactivateUserGroup: jest.Mock;
    reactivateUserGroup: jest.Mock;
  };

  let mockQueryService: {
    getUserGroupById: jest.Mock;
    listUserGroups: jest.Mock;
  };

  beforeAll(async () => {
    mockLifecycleService = {
      createUserGroup: jest.fn().mockResolvedValue({ id: mockUserGroupDetails.id }),
      updateUserGroup: jest.fn().mockResolvedValue({ id: mockUserGroupDetails.id }),
      deactivateUserGroup: jest.fn().mockResolvedValue({ id: mockUserGroupDetails.id }),
      reactivateUserGroup: jest.fn().mockResolvedValue({ id: mockUserGroupDetails.id }),
    };

    mockQueryService = {
      getUserGroupById: jest.fn().mockResolvedValue(mockUserGroupDetails),
      listUserGroups: jest.fn().mockResolvedValue({
        items: [mockUserGroupDetails],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UserGroupAdminController],
      providers: [
        {
          provide: UserGroupLifecycleService,
          useValue: mockLifecycleService,
        },
        {
          provide: UserGroupQueryService,
          useValue: mockQueryService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/admin/user-groups (GET) should list user groups', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/user-groups')
      .expect(HttpStatus.OK);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Engineering Staff');
    expect(response.body.items[0].isPendingSync).toBe(true);
  });

  it('/admin/user-groups (POST) should create dynamic user group', async () => {
    const payload = {
      name: 'Engineering Staff',
      description: 'All engineering members',
      scopeType: ScopeType.DEPARTMENT,
      scopeRefId: 'dept-eng-01',
      matchingRule: {
        clauses: [
          { attribute: 'employmentStatus', operator: 'EQUALS', value: 'ACTIVE' },
          { attribute: 'departmentId', operator: 'EQUALS', value: 'dept-eng-01' },
        ],
      },
      roleIds: [],
    };

    const response = await request(app.getHttpServer())
      .post('/admin/user-groups')
      .send(payload)
      .expect(HttpStatus.CREATED);

    expect(response.body.id).toBe(mockUserGroupDetails.id);
    expect(response.body.hasNoAssignedRoles).toBe(true);
  });

  it('/admin/user-groups/:id (GET) should return group details', async () => {
    const response = await request(app.getHttpServer())
      .get(`/admin/user-groups/${mockUserGroupDetails.id}`)
      .expect(HttpStatus.OK);

    expect(response.body.id).toBe(mockUserGroupDetails.id);
    expect(response.body.scopeType).toBe(ScopeType.DEPARTMENT);
  });

  it('/admin/user-groups/:id/deactivate (POST) should deactivate group', async () => {
    const response = await request(app.getHttpServer())
      .post(`/admin/user-groups/${mockUserGroupDetails.id}/deactivate`)
      .send({ version: 1 })
      .expect(HttpStatus.OK);

    expect(response.body.id).toBe(mockUserGroupDetails.id);
  });

  it('/admin/user-groups/:id/reactivate (POST) should reactivate group', async () => {
    const response = await request(app.getHttpServer())
      .post(`/admin/user-groups/${mockUserGroupDetails.id}/reactivate`)
      .send({ version: 2 })
      .expect(HttpStatus.OK);

    expect(response.body.id).toBe(mockUserGroupDetails.id);
  });
});
