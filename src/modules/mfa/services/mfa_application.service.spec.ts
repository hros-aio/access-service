/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { MfaApplicationService } from './mfa_application.service';
import { KmsCryptoAdapter } from '../adapters/kms-crypto.adapter';
import { RedisMfaChallengeAdapter } from '../adapters/redis_mfa_challenge.adapter';
import { VerifyEnrollmentDto } from '../dto/verify_enrollment.dto';
import { MfaFactorStatus, MfaFactorType, MfaMethod } from '../entities/mfa-method.entity';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

import { AuthApplicationService } from '@/modules/auth/services/auth.application.service';
import { AuthSecurityEventOutboxRepository } from '@/modules/security-event';
import { UserRepository } from '@/modules/user/repositories/user.repository';

describe('MfaApplicationService', () => {
  let service: MfaApplicationService;
  let repository: jest.Mocked<MfaMethodRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let kmsAdapter: jest.Mocked<KmsCryptoAdapter>;
  let challengeAdapter: Record<string, jest.Mock>;
  let transactionService: { runInTransaction: jest.Mock };
  let authApplicationService: Record<string, jest.Mock>;
  let mockOutboxRepository: { create: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(RequestContextService, 'getUser').mockReturnValue({ userId: 'user-1' } as any);
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('tenant-1');
    jest.spyOn(RequestContextService, 'current').mockReturnValue({
      clientMetadata: { ip: '127.0.0.1', userAgent: 'test-agent' },
    } as any);

    repository = {
      findActivePrimary: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<MfaMethodRepository>;

    userRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'user-1', tenantCode: 'tenant-1' }),
    } as unknown as jest.Mocked<UserRepository>;

    kmsAdapter = {
      encrypt: jest.fn().mockResolvedValue('encrypted:secret:123'),
      decrypt: jest.fn().mockResolvedValue('JBSWY3DPEHPK3PXP'),
    } as unknown as jest.Mocked<KmsCryptoAdapter>;

    challengeAdapter = {
      saveChallenge: jest.fn(),
      getChallenge: jest.fn(),
      decrementAttempts: jest.fn(),
      deleteChallenge: jest.fn(),
    };

    transactionService = {
      runInTransaction: jest.fn().mockImplementation(async (cb: () => Promise<unknown>) => cb()),
    };

    authApplicationService = {
      generateAuthTokens: jest.fn().mockReturnValue({
        sessionId: 'sess-1',
        accessToken: 'at',
        refreshToken: 'rt',
      }),
      storeSessionAndLogSuccess: jest.fn().mockResolvedValue(undefined),
    };

    mockOutboxRepository = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaApplicationService,
        { provide: MfaMethodRepository, useValue: repository },
        { provide: UserRepository, useValue: userRepository },
        { provide: KmsCryptoAdapter, useValue: kmsAdapter },
        { provide: RedisMfaChallengeAdapter, useValue: challengeAdapter },
        { provide: TransactionService, useValue: transactionService },
        { provide: AuthApplicationService, useValue: authApplicationService },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = module.get<MfaApplicationService>(MfaApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateEnrollment', () => {
    it('should throw ConflictException if active primary factor exists', async () => {
      repository.findActivePrimary.mockResolvedValue({ id: 'existing-id' } as unknown as MfaMethod);

      await expect(service.initiateEnrollment({ factorType: MfaFactorType.TOTP })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create and return pending enrollment', async () => {
      repository.findActivePrimary.mockResolvedValue(null);
      repository.create.mockResolvedValue({
        id: 'factor-123',
        type: MfaFactorType.TOTP,
        status: MfaFactorStatus.PENDING,
        encryptedSecret: 'encrypted:secret:123',
      } as unknown as MfaMethod);

      const res = await service.initiateEnrollment({
        factorType: MfaFactorType.TOTP,
      });

      expect(res.factorId).toBe('factor-123');
      expect(res.status).toBe(MfaFactorStatus.PENDING);
      expect(res.qrCodeUrl).toContain('otpauth://totp/HRMS:user-1');
    });
  });

  describe('verifyAndActivateFactor', () => {
    it('should throw UnauthorizedException on invalid code', async () => {
      repository.findById.mockResolvedValue({
        id: 'factor-123',
        userId: 'user-1',
        status: MfaFactorStatus.PENDING,
      } as unknown as MfaMethod);

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '999999',
      };

      await expect(service.verifyAndActivateFactor(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if factor does not belong to user', async () => {
      repository.findById.mockResolvedValue({
        id: 'factor-123',
        userId: 'other-user',
        status: MfaFactorStatus.PENDING,
      } as unknown as MfaMethod);

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '123456',
      };

      await expect(service.verifyAndActivateFactor(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException if factor is already activated', async () => {
      repository.findById.mockResolvedValue({
        id: 'factor-123',
        userId: 'user-1',
        status: MfaFactorStatus.ACTIVE,
      } as unknown as MfaMethod);

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '123456',
      };

      await expect(service.verifyAndActivateFactor(dto)).rejects.toThrow(ConflictException);
    });

    it('should activate factor on valid code', async () => {
      const factorEntity = {
        id: 'factor-123',
        userId: 'user-1',
        status: MfaFactorStatus.PENDING,
        type: MfaFactorType.TOTP,
        isPrimary: false,
        verifiedAt: undefined,
      };

      repository.findById.mockResolvedValue(factorEntity as unknown as MfaMethod);

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '123456',
      };

      const res = await service.verifyAndActivateFactor(dto);

      expect(repository.update).toHaveBeenCalledWith(
        'factor-123',
        expect.objectContaining({
          status: MfaFactorStatus.ACTIVE,
          isPrimary: true,
        }),
      );
      expect(mockOutboxRepository.create).toHaveBeenCalledWith({
        tenantCode: 'tenant-1',
        userId: 'user-1',
        eventType: 'authentication.mfa-enrolled',
        sanitizedPayload: {
          tenantCode: 'tenant-1',
          userId: 'user-1',
          factorType: MfaFactorType.TOTP,
          isPrimary: true,
          enrolledAt: expect.any(String),
        },
        publishStatus: 'pending',
      });
      expect(res).toBeDefined();
    });
  });

  describe('verifyLoginChallenge', () => {
    it('should throw UnauthorizedException if challenge expired or missing', async () => {
      challengeAdapter.getChallenge.mockResolvedValue(null);

      await expect(
        service.verifyLoginChallenge({ challengeId: 'ch-1', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens on valid challenge verification', async () => {
      challengeAdapter.getChallenge.mockResolvedValue({
        challengeId: 'ch-1',
        tenantCode: 'tenant-1',
        userId: 'user-1',
        factorType: 'totp',
        codeHash: 'hash',
        attemptsLeft: 5,
        rememberMe: false,
      });

      const result = await service.verifyLoginChallenge({
        challengeId: 'ch-1',
        code: '123456',
      });

      expect(result.accessToken).toBeDefined();
      expect(challengeAdapter.deleteChallenge).toHaveBeenCalledWith('tenant-1', 'user-1', 'ch-1');
    });

    it('should decrement attempts and throw UnauthorizedException on incorrect code', async () => {
      challengeAdapter.getChallenge.mockResolvedValue({
        challengeId: 'ch-1',
        attemptsLeft: 5,
      });
      challengeAdapter.decrementAttempts.mockResolvedValue(4);

      await expect(
        service.verifyLoginChallenge({ challengeId: 'ch-1', code: '999999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw HttpException with TOO_MANY_REQUESTS when max attempts exceeded', async () => {
      challengeAdapter.getChallenge.mockResolvedValue({
        challengeId: 'ch-1',
        attemptsLeft: 1,
      });
      challengeAdapter.decrementAttempts.mockResolvedValue(0);

      await expect(
        service.verifyLoginChallenge({ challengeId: 'ch-1', code: '999999' }),
      ).rejects.toThrow('MFA_CHALLENGE_LOCKED: Maximum attempts exceeded');
    });
  });
});
