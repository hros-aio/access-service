import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { UserGroupRepository } from './user-group.repository';
import { UserGroup } from '../entities/user-group.entity';

describe('UserGroupRepository', () => {
  let repository: UserGroupRepository;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getRawMany: jest.Mock;
  };
  let mockTypeOrmRepo: Partial<Repository<UserGroup>>;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };

    mockTypeOrmRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockTransactionService = {
      getManager: jest.fn().mockReturnValue({
        getRepository: jest.fn().mockReturnValue(mockTypeOrmRepo),
      }),
      runInTransaction: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserGroupRepository,
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    repository = module.get<UserGroupRepository>(UserGroupRepository);
  });

  it('should find dirty user groups when version <> projection_version', async () => {
    (mockTypeOrmRepo.find as jest.Mock).mockResolvedValueOnce([
      { tenantCode: 'TENANT_A', id: 'ug-1', version: 2 },
      { tenantCode: 'TENANT_B', id: 'ug-2', version: 3 },
    ]);

    const results = await repository.findDirtyUserGroups();

    expect(results).toEqual([
      { tenantCode: 'TENANT_A', id: 'ug-1', version: 2 },
      { tenantCode: 'TENANT_B', id: 'ug-2', version: 3 },
    ]);
    expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
      select: ['tenantCode', 'id', 'version'],
      where: {
        version: expect.anything(),
      },
    });
  });
});
