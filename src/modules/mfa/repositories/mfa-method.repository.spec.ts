/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { MfaMethodRepository } from './mfa-method.repository';
import { MfaFactorStatus, MfaMethod } from '../entities/mfa-method.entity';

describe('MfaMethodRepository', () => {
  let repository: MfaMethodRepository;
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
        MfaMethodRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<MfaMethodRepository>(MfaMethodRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find mfa method by ID', async () => {
    const method = new MfaMethod();
    method.id = 'method-uuid';

    mockTypeormRepository.findOne.mockResolvedValue(method);

    const result = await repository.findById('method-uuid');
    expect(result).toEqual(method);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { tenantCode: '000000' },
    });
  });

  it('should find active mfa methods by user ID', async () => {
    const methods = [new MfaMethod()];
    mockTypeormRepository.find.mockResolvedValue(methods);

    const result = await repository.findActiveByUserId('user-uuid');
    expect(result).toEqual(methods);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-uuid', status: MfaFactorStatus.ACTIVE },
    });
  });

  it('should find primary active mfa method by user ID', async () => {
    const method = new MfaMethod();
    method.userId = 'user-uuid';
    method.isPrimary = true;
    method.status = MfaFactorStatus.ACTIVE;

    mockTypeormRepository.findOne.mockResolvedValue(method);

    const result = await repository.findActivePrimary('user-uuid');
    expect(result).toEqual(method);
  });

  it('should disable all user factors', async () => {
    mockTypeormRepository.update.mockResolvedValue({ affected: 1 });

    await repository.disableAllUserFactors('user-uuid');
    expect(mockTypeormRepository.update).toHaveBeenCalledWith(
      { userId: 'user-uuid', tenantCode: (repository as any).tenantCode },
      { status: MfaFactorStatus.DISABLED, disabledAt: expect.any(Date), isPrimary: false },
    );
  });
});
