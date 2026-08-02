import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('PasswordReset (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/password/reset/request should return generic 200 response', async () => {
    const response = await request(app.getHttpServer()).post('/auth/password/reset/request').send({
      tenantCode: 'tenant-test',
      email: 'test-user@example.com',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'If an active account exists, recovery instructions have been sent.',
    });
  });
});
