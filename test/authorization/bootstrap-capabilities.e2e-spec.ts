import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { BootstrapAuthorizationController } from '../../src/modules/authorization/controllers/bootstrap-authorization.controller';
import { BootstrapAuthorizationService } from '../../src/modules/authorization/services/bootstrap-authorization.service';

describe('Bootstrap Authorization Capabilities (e2e)', () => {
  let app: INestApplication;

  const mockBootstrapService = {
    getBootstrapCapabilities: jest.fn().mockResolvedValue({
      authorizationVersion: 7,
      permissions: ['employee.view', 'leave.apply', 'leave.approve'],
      modules: ['employee', 'leave'],
      roles: ['Employee', 'Manager'],
    }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BootstrapAuthorizationController],
      providers: [
        {
          provide: BootstrapAuthorizationService,
          useValue: mockBootstrapService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /auth/bootstrap/capabilities should return 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/auth/bootstrap/capabilities');
    expect(response.status).toBe(401);
  });

  it('GET /auth/bootstrap/capabilities should return capabilities when authenticated headers are provided', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/bootstrap/capabilities')
      .set('x-tenant-code', 'tenant-test')
      .set('x-user-id', 'user-test')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.authorizationVersion).toBe(7);
    expect(response.body.data.permissions).toEqual([
      'employee.view',
      'leave.apply',
      'leave.approve',
    ]);
  });
});
