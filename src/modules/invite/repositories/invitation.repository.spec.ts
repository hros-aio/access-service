/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { InvitationRepository } from './invitation.repository';
import { InvitationStatus } from '../../../enums';
import { Invitation } from '../entities/invitation.entity';

describe('InvitationRepository', () => {
  let repository: InvitationRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
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

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
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
      where: { tenantCode: 'TENANT_A' },
    });
  });

  it('should find invitation by token hash unscoped', async () => {
    const invite = new Invitation();
    invite.tokenHash = 'hash-val';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findByTokenHashUnscoped('hash-val');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: undefined,
      withTenancy: false,
    });
  });

  it('should find invitation by token hash for update unscoped', async () => {
    const invite = new Invitation();
    invite.tokenHash = 'hash-val';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findByTokenHashForUpdateUnscoped('hash-val');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: undefined,
      withTenancy: false,
    });
  });

  it('should find previous invitation by user', async () => {
    const invite = new Invitation();
    invite.userId = 'user-uuid';

    mockTypeormRepository.findOne.mockResolvedValue(invite);

    const result = await repository.findPreviousByUser('user-uuid');
    expect(result).toEqual(invite);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      order: { sentAt: 'DESC' },
      where: undefined,
      withTenancy: false,
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

  it('should bulk save invitations', async () => {
    const invites = [new Invitation()];
    mockTypeormRepository.save.mockResolvedValue(invites);

    const result = await repository.bulkSave(invites);
    expect(result).toEqual(invites);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(invites);
  });

  it('should cancel pending invitations', async () => {
    mockTypeormRepository.update.mockResolvedValue({ affected: 1 });

    await repository.cancelPendingInvitations('user-uuid');

    expect(mockTypeormRepository.update).toHaveBeenCalledWith(
      {
        userId: 'user-uuid',
        tenantCode: 'TENANT_A',
        status: In([InvitationStatus.PENDING, InvitationStatus.SENT]),
      },
      expect.objectContaining({
        status: InvitationStatus.CANCELLED,
      }),
    );
  });
});
