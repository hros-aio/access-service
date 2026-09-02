import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupMembershipRepository } from './user-group-membership.repository';

describe('UserGroupMembershipRepository', () => {
  let repository: UserGroupMembershipRepository;
  let mockManager: { getRepository: jest.Mock; query: jest.Mock };
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockTypeormRepo: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT1');
    mockTypeormRepo = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue([]),
    };
    mockManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepo),
      query: jest.fn(),
    };
    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockManager),
    } as unknown as jest.Mocked<TransactionService>;
    repository = new UserGroupMembershipRepository(mockTransactionService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('batchInsert creates and saves membership entities for given employee ids', async () => {
    await repository.batchInsert('grp-1', ['emp-1', 'emp-2']);

    expect(mockTypeormRepo.create).toHaveBeenCalledTimes(2);
    expect(mockTypeormRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT1',
        groupId: 'grp-1',
        employeeId: 'emp-1',
      }),
    );
    expect(mockTypeormRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT1',
        groupId: 'grp-1',
        employeeId: 'emp-2',
      }),
    );
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ employeeId: 'emp-1' }),
        expect.objectContaining({ employeeId: 'emp-2' }),
      ]),
    );
  });

  it('batchDelete deletes given employee ids using TypeORM In operator', async () => {
    await repository.batchDelete('grp-1', ['emp-1', 'emp-2']);

    expect(mockTypeormRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT1',
        groupId: 'grp-1',
      }),
    );
  });

  it('insertSingleMembership creates and saves single record', async () => {
    await repository.insertSingleMembership('emp-1', 'grp-1');

    expect(mockTypeormRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT1',
        groupId: 'grp-1',
        employeeId: 'emp-1',
      }),
    );
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT1',
        groupId: 'grp-1',
        employeeId: 'emp-1',
      }),
    );
  });
});
