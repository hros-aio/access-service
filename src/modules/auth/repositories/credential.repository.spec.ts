/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { CredentialRepository } from './credential.repository';
import { CredentialStatus } from '../../../enums';
import { Credential } from '../entities/credential.entity';

describe('CredentialRepository', () => {
  let repository: CredentialRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<CredentialRepository>(CredentialRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find credential by ID', async () => {
    const cred = new Credential();
    cred.id = 'cred-uuid';

    mockTypeormRepository.findOne.mockResolvedValue(cred);

    const result = await repository.findById('cred-uuid');
    expect(result).toEqual(cred);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { tenantCode: '000000' },
    });
  });

  it('should find active credential by user ID for update unscope', async () => {
    const cred = new Credential();
    cred.userId = 'user-uuid';
    cred.status = CredentialStatus.ACTIVE;

    mockTypeormRepository.findOne.mockResolvedValue(cred);

    const result = await repository.findActiveByUserForUpdateUnscope('user-uuid');
    expect(result).toEqual(cred);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: undefined,
      withTenancy: false,
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('should find active credential by user ID unscope', async () => {
    const cred = new Credential();
    cred.userId = 'user-uuid';
    cred.status = CredentialStatus.ACTIVE;

    mockTypeormRepository.findOne.mockResolvedValue(cred);

    const result = await repository.findActiveByUseUnscope('user-uuid');
    expect(result).toEqual(cred);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: undefined,
      withTenancy: false,
    });
  });
});
