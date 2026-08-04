import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { SessionService } from './session.service';
import { RedisSessionAdapter } from '../adapters/redis-session.adapter';

describe('SessionService', () => {
  let service: SessionService;
  let mockRedisAdapter: jest.Mocked<RedisSessionAdapter>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockEntityManager: jest.Mocked<EntityManager>;

  beforeEach(() => {
    mockRedisAdapter = {
      deleteSession: jest.fn(),
      purgeAllUserSessions: jest.fn(),
    } as unknown as jest.Mocked<RedisSessionAdapter>;

    mockEntityManager = {
      query: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockEntityManager)),
    } as unknown as jest.Mocked<DataSource>;

    service = new SessionService(mockRedisAdapter, mockDataSource);
  });

  describe('logoutCurrentSession', () => {
    it('should revoke current session and save outbox event inside database transaction', async () => {
      mockRedisAdapter.deleteSession.mockResolvedValue(1);
      mockEntityManager.query.mockResolvedValue([]);

      const result = await service.logoutCurrentSession('TENANT_ACME', 'usr-1', 'sess-1');

      expect(mockRedisAdapter.deleteSession).toHaveBeenCalledWith('TENANT_ACME', 'usr-1', 'sess-1');
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "auth_security_events_outbox"'),
        expect.arrayContaining(['TENANT_ACME', 'usr-1', 'authentication.session-revoked']),
      );
      expect(result).toEqual({ success: true, revokedSessionsCount: 1 });
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should increment security version in DB, append outbox event, and purge Redis sessions', async () => {
      mockEntityManager.query
        .mockResolvedValueOnce([[{ id: 'target-usr-2' }]]) // UPDATE RETURNING
        .mockResolvedValueOnce([]); // INSERT outbox
      mockRedisAdapter.purgeAllUserSessions.mockResolvedValue(3);

      const result = await service.revokeAllUserSessions({
        tenantCode: 'TENANT_ACME',
        targetUserId: 'target-usr-2',
        adminUserId: 'admin-1',
        reason: 'ADMIN_FORCE_LOGOUT',
      });

      expect(mockEntityManager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE "users"'),
        ['TENANT_ACME', 'target-usr-2'],
      );
      expect(mockRedisAdapter.purgeAllUserSessions).toHaveBeenCalledWith(
        'TENANT_ACME',
        'target-usr-2',
      );
      expect(result).toEqual({ success: true, revokedSessionsCount: 3 });
    });

    it('should throw NotFoundException if user not found within tenant scope', async () => {
      mockEntityManager.query.mockResolvedValueOnce([]); // UPDATE returned no rows

      await expect(
        service.revokeAllUserSessions({
          tenantCode: 'TENANT_ACME',
          targetUserId: 'invalid-usr',
          adminUserId: 'admin-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
