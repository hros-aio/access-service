import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { CredentialStatus, UserStatus } from '../src/enums';
import { User } from '../src/modules/user/entities/user.entity';

describe('MFA Integration E2E Test Suite', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    const userRepo = dataSource.getRepository(User);
    const existingUser = await userRepo.findOne({
      where: { id: '00000000-0000-0000-0000-000000000001' },
    });
    if (!existingUser) {
      const user = userRepo.create({
        id: '00000000-0000-0000-0000-000000000001',
        tenantCode: 'tenant-001',
        normalizedEmail: 'test-mfa@example.com',
        displayEmail: 'test-mfa@example.com',
        userType: 'EMPLOYEE',
        status: UserStatus.ACTIVE,
        credentialStatus: CredentialStatus.ACTIVE,
      });
      await userRepo.save(user);
    }
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(
        `DELETE FROM "mfa_methods" WHERE "user_id" = '00000000-0000-0000-0000-000000000001'`,
      );
      const userRepo = dataSource.getRepository(User);
      await userRepo.delete({ id: '00000000-0000-0000-0000-000000000001' });
    }
    await app.close();
  });

  describe('User Story 1: MFA Enrollment', () => {
    it('POST /api/v1/auth/mfa/enroll - should initiate factor enrollment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enroll')
        .send({ factorType: 'totp' })
        .expect(HttpStatus.CREATED);

      expect(res.body.factorId).toBeDefined();
      expect(res.body.status).toBe('pending');
      expect(res.body.qrCodeUrl).toContain('otpauth://totp/HRMS');
    });

    it('POST /api/v1/auth/mfa/enroll/verify - should fail on invalid code', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enroll/verify')
        .send({
          factorId: '00000000-0000-0000-0000-000000000001',
          factorType: 'totp',
          code: '000000',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('User Story 2: MFA Login Challenge', () => {
    it('POST /api/v1/auth/mfa/challenge/verify - should fail on expired/missing challenge', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/challenge/verify')
        .send({
          challengeId: '00000000-0000-0000-0000-000000000002',
          code: '123456',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('User Story 4: Admin Reset MFA', () => {
    it('POST /api/v1/admin/users/:userId/mfa/reset - should attempt reset for user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/users/00000000-0000-0000-0000-000000000099/mfa/reset')
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
