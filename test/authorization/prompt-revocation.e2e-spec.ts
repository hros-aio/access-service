import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { AuthorizationSyncJobRepository } from '../../src/modules/authorization/repositories/authorization-sync-job.repository';
import { AuthorizationSyncService } from '../../src/modules/authorization/services/authorization-sync.service';
import { EffectiveRoleProjectionService } from '../../src/modules/authorization/services/effective-role-projection.service';
import { RoleApplicationService } from '../../src/modules/roles/services/role.application.service';

describe('Prompt Sensitive Access Revocation E2E / Integration Suite', () => {
  let app: INestApplication;
  let roleApplicationService: RoleApplicationService;
  let authorizationSyncService: AuthorizationSyncService;
  let syncJobRepository: AuthorizationSyncJobRepository;
  let effectiveRoleProjectionService: EffectiveRoleProjectionService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    roleApplicationService = moduleFixture.get<RoleApplicationService>(RoleApplicationService);
    authorizationSyncService =
      moduleFixture.get<AuthorizationSyncService>(AuthorizationSyncService);
    syncJobRepository = moduleFixture.get<AuthorizationSyncJobRepository>(
      AuthorizationSyncJobRepository,
    );
    effectiveRoleProjectionService = moduleFixture.get<EffectiveRoleProjectionService>(
      EffectiveRoleProjectionService,
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should verify services are wired and defined', () => {
    expect(roleApplicationService).toBeDefined();
    expect(authorizationSyncService).toBeDefined();
    expect(syncJobRepository).toBeDefined();
    expect(effectiveRoleProjectionService).toBeDefined();
  });
});
