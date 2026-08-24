import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { DependencyRuleDto } from '../../src/modules/permissions/dto/permission-catalog-response.dto';
import { PermissionsModule } from '../../src/modules/permissions/permissions.module';

describe('PermissionsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PermissionsModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /permissions/catalog', () => {
    it('should return 200 with structured hierarchy', async () => {
      const response = await request(app.getHttpServer()).get('/permissions/catalog').expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.totalModules).toBeGreaterThan(0);
      expect(response.body.totalPermissions).toBeGreaterThan(0);
      expect(Array.isArray(response.body.modules)).toBe(true);

      const firstModule = response.body.modules[0];
      expect(firstModule).toHaveProperty('module');
      expect(firstModule).toHaveProperty('resources');
      expect(firstModule.resources.length).toBeGreaterThan(0);
    });
  });

  describe('GET /permissions/dependencies', () => {
    it('should return 200 with dependency matrix rules', async () => {
      const response = await request(app.getHttpServer())
        .get('/permissions/dependencies')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.dependencies)).toBe(true);

      const locationCreateRule = response.body.dependencies.find(
        (d: DependencyRuleDto) => d.permissionCode === 'location.create',
      );
      expect(locationCreateRule).toBeDefined();
      expect(locationCreateRule.requires).toContain('location.view');
    });
  });
});
