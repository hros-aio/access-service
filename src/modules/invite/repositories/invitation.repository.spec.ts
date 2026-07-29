/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { InvitationRepository } from './invitation.repository';
import { InvitationStatus } from '../../../enums';
import { Invitation } from '../entities/invitation.entity';

describe('InvitationRepository', () => {
  let repository: InvitationRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    mockTypeormRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<InvitationRepository>(InvitationRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find invitation by ID', async () => {
    const invite = new Invitation();
    invite.id = 'invite-uuid';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findById('invite-uuid');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'invite-uuid' },
    });
  });

  it('should find invitation by token hash', async () => {
    const invite = new Invitation();
    invite.tokenHash = 'hash-val';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findByTokenHash('hash-val');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { tokenHash: 'hash-val' },
    });
  });

  it('should find active invitation by user ID', async () => {
    const invite = new Invitation();
    invite.userId = 'user-uuid';
    invite.status = InvitationStatus.SENT;

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findActiveByUserId('user-uuid');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: [
        { userId: 'user-uuid', status: InvitationStatus.PENDING },
        { userId: 'user-uuid', status: InvitationStatus.SENT },
      ],
    });
  });

  it('should save invitation', async () => {
    const invite = new Invitation();
    mockTypeormRepository.save.mockResolvedValue(invite);

    const result = await repository.save(invite);
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(invite);
  });

  describe('findPendingForUpdate', () => {
    it('should query with locks and tenant parameters', async () => {
      const invite = new Invitation();
      mockQueryBuilder.getOne.mockResolvedValue(invite);

      const result = await repository.findPendingForUpdate(
        'tenant-code',
        'user-uuid',
        'token-hash',
      );
      expect(result).toEqual(invite);
      expect(mockTypeormRepository.createQueryBuilder).toHaveBeenCalledWith('invitation');
      expect(mockQueryBuilder.innerJoinAndSelect).toHaveBeenCalledWith('invitation.user', 'user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.tenantCode = :tenantCode', {
        tenantCode: 'tenant-code',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('invitation.userId = :userId', {
        userId: 'user-uuid',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "invitation.status IN ('pending', 'sent')",
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('invitation.tokenHash = :tokenHash', {
        tokenHash: 'token-hash',
      });
      expect(mockQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    });
  });

  describe('findByTenantAndTokenHash', () => {
    it('should query by tenant and token hash without lock', async () => {
      const invite = new Invitation();
      mockQueryBuilder.getOne.mockResolvedValue(invite);

      const result = await repository.findByTenantAndTokenHash('tenant-code', 'token-hash');
      expect(result).toEqual(invite);
      expect(mockTypeormRepository.createQueryBuilder).toHaveBeenCalledWith('invitation');
      expect(mockQueryBuilder.innerJoinAndSelect).toHaveBeenCalledWith('invitation.user', 'user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.tenantCode = :tenantCode', {
        tenantCode: 'tenant-code',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('invitation.tokenHash = :tokenHash', {
        tokenHash: 'token-hash',
      });
    });
  });
});
