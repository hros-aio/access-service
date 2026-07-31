import crypto from 'crypto';

// Always generate a valid key pair for test signing/verification to override mock environment settings
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;

process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'hrms_access_db_test';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { TestDatabaseHelper } from './test-database.helper';
import { AppModule } from '../src/app.module';
import { CredentialStatus, UserStatus } from '../src/enums';
import { AuthSecurityEventOutbox } from '../src/modules/auth/entities/auth-security-event-outbox.entity';
import { Credential } from '../src/modules/auth/entities/credential.entity';
import { CredentialDomainService } from '../src/modules/auth/services/credential.domain.service';
import { MfaMethod } from '../src/modules/mfa/entities/mfa-method.entity';
import { AuthenticationSettings } from '../src/modules/tenant/entities/authentication-settings.entity';
import { Tenant } from '../src/modules/tenant/entities/tenant.entity';
import { User } from '../src/modules/user/entities/user.entity';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let dbHelper: TestDatabaseHelper;
  let credentialService: CredentialDomainService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    dbHelper = new TestDatabaseHelper(dataSource);
    credentialService = app.get(CredentialDomainService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.cleanDatabase();

    // 1. Seed Tenant
    const tenant = new Tenant();
    tenant.tenantCode = 'TENANT_TEST';
    tenant.companyId = 'company-test-123';
    tenant.status = 'active';
    await dataSource.getRepository(Tenant).save(tenant);

    // 2. Seed User
    const user = new User();
    user.id = 'a32e12e8-d101-4475-b6d1-419bd1e967a1';
    user.tenantCode = 'TENANT_TEST';
    user.normalizedEmail = 'employee@tenant.com';
    user.displayEmail = 'employee@tenant.com';
    user.userType = 'employee';
    user.status = UserStatus.ACTIVE;
    user.credentialStatus = CredentialStatus.ACTIVE;
    user.securityVersion = 1;
    await dataSource.getRepository(User).save(user);

    // 3. Hash password and seed Credential
    const { hash, algorithm } = await credentialService.hashPassword('SecurePassword123!');
    const credential = new Credential();
    credential.userId = user.id;
    credential.passwordHash = hash;
    credential.algorithm = algorithm;
    credential.status = CredentialStatus.ACTIVE;
    await dataSource.getRepository(Credential).save(credential);

    // Seed MFA User
    const mfaUser = new User();
    mfaUser.id = 'b43f23f8-e202-5586-c7e2-520ce2e078b2';
    mfaUser.tenantCode = 'TENANT_TEST';
    mfaUser.normalizedEmail = 'mfa-employee@tenant.com';
    mfaUser.displayEmail = 'mfa-employee@tenant.com';
    mfaUser.userType = 'employee';
    mfaUser.status = UserStatus.ACTIVE;
    mfaUser.credentialStatus = CredentialStatus.ACTIVE;
    mfaUser.securityVersion = 1;
    await dataSource.getRepository(User).save(mfaUser);

    // Seed Credential for MFA User
    const mfaCred = new Credential();
    mfaCred.userId = mfaUser.id;
    mfaCred.passwordHash = hash;
    mfaCred.algorithm = algorithm;
    mfaCred.status = CredentialStatus.ACTIVE;
    await dataSource.getRepository(Credential).save(mfaCred);

    // Seed MfaMethod for MFA User
    const mfaMethod = new MfaMethod();
    mfaMethod.userId = mfaUser.id;
    mfaMethod.type = 'sms';
    mfaMethod.status = 'active';
    mfaMethod.isPrimary = true;
    await dataSource.getRepository(MfaMethod).save(mfaMethod);

    // Seed AuthenticationSettings for the tenant
    const authSettings = new AuthenticationSettings();
    authSettings.tenantCode = 'TENANT_TEST';
    authSettings.accountLockoutEnabled = true;
    authSettings.maxFailedRetries = 3; // lower threshold for quick lockout trigger
    authSettings.ipRestrictionEnabled = false; // keep disabled by default
    authSettings.allowedIpCidrs = ['192.168.1.0/24'];
    await dataSource.getRepository(AuthenticationSettings).save(authSettings);
  });

  it('/auth/login/password (POST) - 200 OK with valid credentials', async () => {
    return request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      })
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.authState).toBe('AUTHENTICATED');
        expect(res.body.accessToken).toBeDefined();
        // Verify set-cookie header contains refresh token
        const cookies = (res.headers['set-cookie'] || []) as string[];
        const hasRefreshToken = cookies.some((c: string) => c.startsWith('__Host-refresh-token='));
        expect(hasRefreshToken).toBe(true);
      });
  });

  it('/auth/login/password (POST) - 401 Unauthorized with invalid password', async () => {
    return request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'employee@tenant.com',
        password: 'WrongPassword123!',
      })
      .expect(401)
      .expect((res: Response) => {
        expect(res.body.message).toBe('Invalid email or password.');
      });
  });

  it('/auth/login/password (POST) - 200 OK with valid credentials and MFA enrolled (returns MFA_REQUIRED)', async () => {
    return request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'mfa-employee@tenant.com',
        password: 'SecurePassword123!',
      })
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.authState).toBe('MFA_REQUIRED');
        expect(res.body.challengeId).toBeDefined();
        expect(res.body.accessToken).toBeUndefined();
        expect(res.body.refreshToken).toBeUndefined();
      });
  });

  it('/auth/login/password (POST) - 401 Unauthorized when IP restriction is enabled and IP not allowed', async () => {
    // Enable IP restriction for this test
    const repo = dataSource.getRepository(AuthenticationSettings);
    const settings = await repo.findOneBy({ tenantCode: 'TENANT_TEST' });
    if (settings) {
      settings.ipRestrictionEnabled = true;
      settings.allowedIpCidrs = ['10.0.0.0/24'];
      await repo.save(settings);
    }

    return request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      })
      .expect(401)
      .expect((res: Response) => {
        expect(res.body.message).toBe('Invalid email or password.');
      });
  });

  it('/auth/login/password (POST) - Account locks after max failed attempts', async () => {
    const userRepo = dataSource.getRepository(User);

    // Verify initial user status
    let user = await userRepo.findOneBy({ normalizedEmail: 'employee@tenant.com' });
    expect(user?.status).toBe(UserStatus.ACTIVE);

    // Perform 3 failed attempts (since maxFailedRetries = 3)
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/auth/login/password')
        .set('x-tenant-code', 'TENANT_TEST')
        .send({
          tenantCode: 'TENANT_TEST',
          email: 'employee@tenant.com',
          password: 'WrongPassword!',
        })
        .expect(401);
    }

    // Verify user is locked in database
    user = await userRepo.findOneBy({ normalizedEmail: 'employee@tenant.com' });
    expect(user?.status).toBe(UserStatus.LOCKED);

    // Verify subsequent attempt fails with generic 401 even with correct password
    await request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'employee@tenant.com',
        password: 'SecurePassword123!',
      })
      .expect(401)
      .expect((res: Response) => {
        expect(res.body.message).toBe('Invalid email or password.');
      });
  });

  it('/auth/login/password (POST) - Security events are logged to outbox, sanitizing passwords', async () => {
    const outboxRepo = dataSource.getRepository(AuthSecurityEventOutbox);
    await outboxRepo.clear();

    const sensitivePassword = 'MySecretRawPassword!';

    // Trigger a failed login
    await request(app.getHttpServer())
      .post('/auth/login/password')
      .set('x-tenant-code', 'TENANT_TEST')
      .send({
        tenantCode: 'TENANT_TEST',
        email: 'employee@tenant.com',
        password: sensitivePassword,
      })
      .expect(401);

    // Query outbox
    const events = await outboxRepo.find();
    expect(events.length).toBeGreaterThan(0);

    // Check that the payload does not contain the password
    const failedEvent = events.find((e) => e.eventType === 'authentication.login-failed');
    expect(failedEvent).toBeDefined();

    const payloadStr = JSON.stringify(failedEvent?.sanitizedPayload);
    expect(payloadStr).not.toContain(sensitivePassword);
  });
});
