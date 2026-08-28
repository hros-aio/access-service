import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupMembershipRepository } from './user-group-membership.repository';

describe('UserGroupMembershipRepository', () => {
  let repository: UserGroupMembershipRepository;
  let mockManager: { getRepository: jest.Mock; query: jest.Mock };
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockTypeormRepo: { find: jest.Mock; findAndCount: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    mockTypeormRepo = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn(),
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

  it('batchInsert inserts employee ids with parameterized statement', async () => {
    mockManager.query.mockResolvedValueOnce([]);

    await repository.batchInsert('TENANT1', 'grp-1', ['emp-1', 'emp-2']);

    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_group_memberships'),
      ['TENANT1', 'grp-1', 'emp-1', 'emp-2'],
    );
  });

  it('batchDelete deletes given employee ids', async () => {
    mockManager.query.mockResolvedValueOnce([]);

    await repository.batchDelete('TENANT1', 'grp-1', ['emp-1', 'emp-2']);

    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_group_memberships'),
      ['TENANT1', 'grp-1', ['emp-1', 'emp-2']],
    );
  });
});
