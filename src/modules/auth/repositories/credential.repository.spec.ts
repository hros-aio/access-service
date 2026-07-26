/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { CredentialRepository } from './credential.repository';
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
      where: { id: 'cred-uuid' },
    });
  });

  it('should find active credential by user ID', async () => {
    const cred = new Credential();
    cred.userId = 'user-uuid';
    cred.status = 'active';

    mockTypeormRepository.findOne.mockResolvedValue(cred);

    const result = await repository.findActiveByUserId('user-uuid');
    expect(result).toEqual(cred);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-uuid', status: 'active' },
    });
  });

  it('should find credentials by user ID', async () => {
    const creds = [new Credential()];
    mockTypeormRepository.find.mockResolvedValue(creds);

    const result = await repository.findByUserId('user-uuid');
    expect(result).toEqual(creds);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-uuid' },
    });
  });

  it('should save credential', async () => {
    const cred = new Credential();
    mockTypeormRepository.save.mockResolvedValue(cred);

    const result = await repository.save(cred);
    expect(result).toEqual(cred);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(cred);
  });
});
