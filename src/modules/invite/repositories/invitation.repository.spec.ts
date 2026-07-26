/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { InvitationRepository } from './invitation.repository';
import { Invitation } from '../entities/invitation.entity';

describe('InvitationRepository', () => {
  let repository: InvitationRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
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
    invite.status = 'sent';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findActiveByUserId('user-uuid');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: [
        { userId: 'user-uuid', status: 'pending' },
        { userId: 'user-uuid', status: 'sent' },
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
});
