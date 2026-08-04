import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import supertest from 'supertest';

import { SessionController } from '../src/modules/session/controllers/session.controller';
import { SessionService } from '../src/modules/session/services/session.service';

describe('SessionController (E2E)', () => {
  let app: INestApplication;
  let mockSessionService: jest.Mocked<Partial<SessionService>>;

  beforeAll(async () => {
    mockSessionService = {
      logoutCurrentSession: jest.fn().mockResolvedValue({ success: true, revokedSessionsCount: 1 }),
      revokeAllUserSessions: jest
        .fn()
        .mockResolvedValue({ success: true, revokedSessionsCount: 2 }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/logout', () => {
    it('should return 200 OK and revoked count on logout', async () => {
      const res = await supertest(app.getHttpServer()).post('/auth/logout').expect(200);

      expect(res.body).toEqual({ success: true, revokedSessionsCount: 1 });
      expect(mockSessionService.logoutCurrentSession).toHaveBeenCalled();
    });
  });

  describe('POST /admin/users/:userId/force-logout', () => {
    it('should return 200 OK when admin force-logouts a target user', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/admin/users/usr-target-123/force-logout')
        .send({ reason: 'SECURITY_AUDIT' })
        .expect(200);

      expect(res.body).toEqual({ success: true, revokedSessionsCount: 2 });
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: 'usr-target-123',
          reason: 'SECURITY_AUDIT',
        }),
      );
    });
  });
});
