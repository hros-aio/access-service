import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupQueryService } from './user-group-query.service';
import { ScopeType, UserGroupStatus } from '../domain/enums';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupQueryService', () => {
  let service: UserGroupQueryService;
  let userGroupRepository: jest.Mocked<UserGroupRepository>;

  const mockTenantCode = 'tenant-001';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(mockTenantCode);

    userGroupRepository = {
      findById: jest.fn(),
      list: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    service = new UserGroupQueryService(userGroupRepository);
  });

  it('should return user group details and correctly compute isPendingSync and hasNoAssignedRoles', async () => {
    const mockGroup = {
      id: 'group-1',
      tenantCode: mockTenantCode,
      name: 'Engineering Staff',
      description: 'Eng team',
      status: UserGroupStatus.ACTIVE,
      scopeType: ScopeType.DEPARTMENT,
      matchingRule: { clauses: [] },
      ruleAttributeKeys: ['departmentId'],
      version: 2,
      projectionVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      groupRoles: [],
    } as unknown as UserGroup;

    userGroupRepository.findById.mockResolvedValue(mockGroup);

    const result = await service.findById('group-1');

    expect(result.id).toEqual('group-1');
    expect(result.isPendingSync).toBe(true);
    expect(result.hasNoAssignedRoles).toBe(true);
    expect(result.assignedRoles).toEqual([]);
  });

  it('should throw error when group is not found', async () => {
    userGroupRepository.findById.mockImplementation(async (id, options) => {
      if (options?.required) {
        throw new Error(`Record not found with ID: ${id}`);
      }
      return null;
    });

    await expect(service.findById('non-existent')).rejects.toThrow(
      'Record not found with ID: non-existent',
    );
  });

  it('should list paginated user groups with search and status filters', async () => {
    const mockGroups = [
      {
        id: 'group-1',
        tenantCode: mockTenantCode,
        name: 'Engineering Staff',
        status: UserGroupStatus.ACTIVE,
        scopeType: ScopeType.DEPARTMENT,
        matchingRule: { clauses: [] },
        ruleAttributeKeys: [],
        version: 1,
        projectionVersion: 1,
        groupRoles: [
          {
            role: {
              id: 'role-1',
              name: 'Engineer',
              type: 'CUSTOM',
            },
          },
        ],
      },
    ] as unknown as UserGroup[];

    userGroupRepository.list.mockResolvedValue({
      data: mockGroups,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await service.list({ page: 1, limit: 20, search: 'Engineering' });

    expect(result.total).toBe(1);
    expect(result.data.length).toBe(1);
    expect(result.data[0].hasNoAssignedRoles).toBe(false);
    expect(result.data[0].isPendingSync).toBe(false);
    expect(result.data[0].assignedRoles[0].name).toBe('Engineer');
  });
});
