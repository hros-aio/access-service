import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { MfaApplicationService } from './mfa_application.service';
import { MfaFactorStatus } from './mfa_application.service';
import { KmsCryptoAdapter } from '../adapters/kms-crypto.adapter';
import { RedisMfaChallengeAdapter } from '../adapters/redis_mfa_challenge.adapter';
import { MfaFactorType } from '../dto/enroll_mfa.dto';
import { VerifyEnrollmentDto } from '../dto/verify_enrollment.dto';
import { MfaMethod } from '../entities/mfa-method.entity';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

describe('MfaApplicationService', () => {
  let service: MfaApplicationService;
  let repository: jest.Mocked<MfaMethodRepository>;
  let kmsAdapter: jest.Mocked<KmsCryptoAdapter>;
  let challengeAdapter: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
      query: jest.fn(),
    },
  };

  beforeEach(async () => {
    repository = {
      findActivePrimary: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<MfaMethodRepository>;

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

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaApplicationService,
        { provide: MfaMethodRepository, useValue: repository },
        { provide: KmsCryptoAdapter, useValue: kmsAdapter },
        { provide: RedisMfaChallengeAdapter, useValue: challengeAdapter },
        { provide: DataSource, useValue: dataSource },
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

      await expect(
        service.initiateEnrollment('tenant-1', 'user-1', { factorType: MfaFactorType.TOTP }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create and return pending enrollment', async () => {
      repository.findActivePrimary.mockResolvedValue(null);
      repository.create.mockReturnValue({
        tenantCode: 'tenant-1',
        userId: 'user-1',
        factorType: MfaFactorType.TOTP,
        status: MfaFactorStatus.PENDING,
        encryptedSecret: 'encrypted:secret:123',
      } as unknown as MfaMethod);
      repository.save.mockResolvedValue({
        id: 'factor-123',
        factorType: MfaFactorType.TOTP,
        status: MfaFactorStatus.PENDING,
      } as unknown as MfaMethod);

      const res = await service.initiateEnrollment('tenant-1', 'user-1', {
        factorType: MfaFactorType.TOTP,
      });

      expect(res.factorId).toBe('factor-123');
      expect(res.status).toBe('pending');
      expect(res.qrCodeUrl).toContain('otpauth://totp/HRMS:user-1');
    });
  });

  describe('verifyAndActivateFactor', () => {
    it('should throw UnauthorizedException on invalid code', async () => {
      repository.findOne.mockResolvedValue({
        id: 'factor-123',
        status: MfaFactorStatus.PENDING,
      } as unknown as MfaMethod);

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '999999',
      };

      await expect(service.verifyAndActivateFactor('tenant-1', 'user-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should activate factor and emit outbox event on valid code', async () => {
      const factorEntity = {
        id: 'factor-123',
        status: MfaFactorStatus.PENDING,
        factorType: MfaFactorType.TOTP,
      };

      repository.findOne.mockResolvedValue(factorEntity as unknown as MfaMethod);
      mockQueryRunner.manager.save.mockResolvedValue({
        ...factorEntity,
        status: MfaFactorStatus.ACTIVE,
        isPrimary: true,
        lastUsedAt: new Date(),
      });

      const dto: VerifyEnrollmentDto = {
        factorId: 'factor-123',
        factorType: MfaFactorType.TOTP,
        code: '123456',
      };

      const res = await service.verifyAndActivateFactor('tenant-1', 'user-1', dto);

      expect(res.status).toBe(MfaFactorStatus.ACTIVE);
      expect(res.isPrimary).toBe(true);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('verifyLoginChallenge', () => {
    it('should throw UnauthorizedException if challenge expired or missing', async () => {
      challengeAdapter.getChallenge.mockResolvedValue(null);

      await expect(
        service.verifyLoginChallenge('tenant-1', 'user-1', { challengeId: 'ch-1', code: '123456' }),
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
      });

      const result = await service.verifyLoginChallenge('tenant-1', 'user-1', {
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
        service.verifyLoginChallenge('tenant-1', 'user-1', { challengeId: 'ch-1', code: '999999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw HttpException with TOO_MANY_REQUESTS when max attempts exceeded', async () => {
      challengeAdapter.getChallenge.mockResolvedValue({
        challengeId: 'ch-1',
        attemptsLeft: 1,
      });
      challengeAdapter.decrementAttempts.mockResolvedValue(0);

      await expect(
        service.verifyLoginChallenge('tenant-1', 'user-1', { challengeId: 'ch-1', code: '999999' }),
      ).rejects.toThrow('MFA_CHALLENGE_LOCKED: Maximum attempts exceeded');
    });
  });
});
