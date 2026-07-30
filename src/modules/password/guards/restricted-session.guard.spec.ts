import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { RestrictedSessionGuard } from './restricted-session.guard';
import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
} from '../exceptions/password.exception';

describe('RestrictedSessionGuard', () => {
  let guard: RestrictedSessionGuard;
  let mockRedisClient: Record<string, jest.Mock>;
  let mockRedisCacheProvider: Record<string, unknown>;

  beforeEach(async () => {
    mockRedisClient = {
      hgetall: jest.fn(),
    };

    mockRedisCacheProvider = {
      client: mockRedisClient,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestrictedSessionGuard,
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
      ],
    }).compile();

    guard = module.get<RestrictedSessionGuard>(RestrictedSessionGuard);
  });

  const createMockContext = (headers: Record<string, string>): ExecutionContext => {
    const request = {
      headers,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access and attach session info for a valid setup token', async () => {
    const context = createMockContext({ authorization: 'Bearer flow-123' });
    const sessionData = {
      userId: 'user-uuid',
      tenantCode: 'tenant-abc',
      authState: 'sso-setup-pending',
    };

    mockRedisClient.hgetall.mockResolvedValue(sessionData);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    const request = context.switchToHttp().getRequest() as { session?: Record<string, unknown> };
    expect(request.session).toEqual({
      userId: 'user-uuid',
      tenantCode: 'tenant-abc',
      flowId: 'flow-123',
    });
    expect(mockRedisClient.hgetall).toHaveBeenCalledWith('auth:sso-setup:flow-123');
  });

  it('should throw AuthSessionExpiredError if Authorization header is missing', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(AuthSessionExpiredError);
  });

  it('should throw AuthSessionExpiredError if Authorization header does not start with Bearer', async () => {
    const context = createMockContext({ authorization: 'Basic credentials' });
    await expect(guard.canActivate(context)).rejects.toThrow(AuthSessionExpiredError);
  });

  it('should throw AuthSessionExpiredError if session data in Redis is empty', async () => {
    const context = createMockContext({ authorization: 'Bearer flow-expired' });
    mockRedisClient.hgetall.mockResolvedValue({});

    await expect(guard.canActivate(context)).rejects.toThrow(AuthSessionExpiredError);
  });

  it('should throw AuthSessionExpiredError if authState is not sso-setup-pending', async () => {
    const context = createMockContext({ authorization: 'Bearer flow-invalid' });
    mockRedisClient.hgetall.mockResolvedValue({
      userId: 'user-uuid',
      tenantCode: 'tenant-abc',
      authState: 'another-state',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(AuthSessionExpiredError);
  });

  it('should throw AuthStoreUnavailableError if Redis client query fails', async () => {
    const context = createMockContext({ authorization: 'Bearer flow-error' });
    mockRedisClient.hgetall.mockRejectedValue(new Error('Redis is down'));

    await expect(guard.canActivate(context)).rejects.toThrow(AuthStoreUnavailableError);
  });
});
