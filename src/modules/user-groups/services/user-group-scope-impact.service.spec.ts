import { RequestContextService } from '@new-hros/libs-core';

import { UserGroupScopeImpactService } from './user-group-scope-impact.service';
import { ScopeType } from '../domain/enums/scope-type.enum';
import {
  InvalidScopeError,
  UserGroupNotFoundError,
} from '../domain/exceptions/user-group.exceptions';
import { UserGroup } from '../entities/user-group.entity';
import { UserGroupMembershipRepository } from '../repositories/user-group-membership.repository';
import { UserGroupRepository } from '../repositories/user-group.repository';

describe('UserGroupScopeImpactService', () => {
  let service: UserGroupScopeImpactService;
  let userGroupRepo: jest.Mocked<UserGroupRepository>;
  let membershipRepo: jest.Mocked<UserGroupMembershipRepository>;

  const tenantCode = 'test-tenant';
  const userGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(tenantCode);

    userGroupRepo = {
      findByTenantAndId: jest.fn(),
    } as unknown as jest.Mocked<UserGroupRepository>;

    membershipRepo = {
      countByGroup: jest.fn(),
    } as unknown as jest.Mocked<UserGroupMembershipRepository>;

    service = new UserGroupScopeImpactService(userGroupRepo, membershipRepo);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should throw UserGroupNotFoundError if user group does not exist', async () => {
    userGroupRepo.findByTenantAndId.mockResolvedValue(null);

    await expect(
      service.estimateScopeImpact(userGroupId, ScopeType.DEPARTMENT, 'dept-1'),
    ).rejects.toThrow(UserGroupNotFoundError);
  });

  it('should throw InvalidScopeError if proposed scope is invalid', async () => {
    const mockGroup = new UserGroup();
    mockGroup.id = userGroupId;
    mockGroup.scopeType = ScopeType.SELF;
    userGroupRepo.findByTenantAndId.mockResolvedValue(mockGroup);

    await expect(
      service.estimateScopeImpact(userGroupId, ScopeType.DEPARTMENT, null),
    ).rejects.toThrow(InvalidScopeError);
  });

  it('should return impact estimate below threshold (requiresConfirmation: false)', async () => {
    const mockGroup = new UserGroup();
    mockGroup.id = userGroupId;
    mockGroup.scopeType = ScopeType.SELF;
    mockGroup.scopeRefId = undefined;
    userGroupRepo.findByTenantAndId.mockResolvedValue(mockGroup);
    membershipRepo.countByGroup.mockResolvedValue(45);

    const result = await service.estimateScopeImpact(userGroupId, ScopeType.COMPANY, 'comp-10');

    expect(result).toEqual({
      userGroupId,
      affectedUserCount: 45,
      threshold: 100,
      requiresConfirmation: false,
      currentScope: {
        scopeType: ScopeType.SELF,
        scopeRefId: null,
      },
      proposedScope: {
        scopeType: ScopeType.COMPANY,
        scopeRefId: 'comp-10',
      },
    });
  });

  it('should flag requiresConfirmation: true when affected users >= threshold', async () => {
    const mockGroup = new UserGroup();
    mockGroup.id = userGroupId;
    mockGroup.scopeType = ScopeType.DEPARTMENT;
    mockGroup.scopeRefId = 'dept-01';
    userGroupRepo.findByTenantAndId.mockResolvedValue(mockGroup);
    membershipRepo.countByGroup.mockResolvedValue(5000);

    const result = await service.estimateScopeImpact(userGroupId, ScopeType.TENANT_WIDE);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.affectedUserCount).toBe(5000);
    expect(result.proposedScope).toEqual({
      scopeType: ScopeType.TENANT_WIDE,
      scopeRefId: null,
    });
  });
});
