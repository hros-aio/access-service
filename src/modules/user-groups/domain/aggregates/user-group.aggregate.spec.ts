import { ScopeType } from '../enums';
import { UserGroupAggregate } from './user-group.aggregate';
import { MatchingRule } from '../value-objects/matching-rule.vo';

describe('UserGroupAggregate (Role Assignment)', () => {
  const baseMatchingRule: MatchingRule = {
    clauses: [
      {
        attribute: 'departmentId',
        operator: 'eq',
        value: 'dept-1',
      },
    ],
  };

  it('should assign roles, appending unique IDs and incrementing version', () => {
    const aggregate = UserGroupAggregate.create({
      tenantCode: 'tenant-test',
      name: 'Engineering Group',
      scopeType: ScopeType.TENANT_WIDE,
      matchingRule: baseMatchingRule,
      assignedRoleIds: ['role-1'],
    });

    expect(aggregate.version).toBe(1);
    expect(aggregate.assignedRoleIds).toEqual(['role-1']);

    const { addedRoleIds } = aggregate.assignRoles(['role-2', 'role-1', 'role-3'], 'user-123');

    expect(addedRoleIds).toEqual(['role-2', 'role-3']);
    expect(aggregate.assignedRoleIds).toEqual(['role-1', 'role-2', 'role-3']);
    expect(aggregate.version).toBe(2);
    expect(aggregate.updatedBy).toBe('user-123');
    expect(aggregate.isPendingSync).toBe(true);
  });

  it('should unassign roles and increment version', () => {
    const aggregate = UserGroupAggregate.create({
      tenantCode: 'tenant-test',
      name: 'Engineering Group',
      scopeType: ScopeType.TENANT_WIDE,
      matchingRule: baseMatchingRule,
      assignedRoleIds: ['role-1', 'role-2', 'role-3'],
    });

    const { removedRoleIds } = aggregate.unassignRoles(['role-2', 'role-99'], 'user-123');

    expect(removedRoleIds).toEqual(['role-2']);
    expect(aggregate.assignedRoleIds).toEqual(['role-1', 'role-3']);
    expect(aggregate.version).toBe(2);
  });

  it('should replace roles with complete delta computation', () => {
    const aggregate = UserGroupAggregate.create({
      tenantCode: 'tenant-test',
      name: 'Engineering Group',
      scopeType: ScopeType.TENANT_WIDE,
      matchingRule: baseMatchingRule,
      assignedRoleIds: ['role-1', 'role-2'],
    });

    const { addedRoleIds, removedRoleIds } = aggregate.replaceRoles(
      ['role-2', 'role-3', 'role-4'],
      'user-123',
    );

    expect(addedRoleIds).toEqual(['role-3', 'role-4']);
    expect(removedRoleIds).toEqual(['role-1']);
    expect(aggregate.assignedRoleIds).toEqual(['role-2', 'role-3', 'role-4']);
    expect(aggregate.version).toBe(2);
  });

  describe('updateScope', () => {
    it('should update scope to entity-anchored scope and bump version', () => {
      const aggregate = UserGroupAggregate.create({
        tenantCode: 'tenant-test',
        name: 'Engineering Group',
        scopeType: ScopeType.SELF,
        matchingRule: baseMatchingRule,
      });

      const { previousScope, newScope } = aggregate.updateScope(
        {
          scopeType: ScopeType.DEPARTMENT,
          scopeRefId: 'dept-eng-01',
        },
        'user-admin',
      );

      expect(previousScope).toEqual({
        scopeType: ScopeType.SELF,
        scopeRefId: null,
      });
      expect(newScope).toEqual({
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: 'dept-eng-01',
      });
      expect(aggregate.scopeType).toBe(ScopeType.DEPARTMENT);
      expect(aggregate.scopeRefId).toBe('dept-eng-01');
      expect(aggregate.version).toBe(2);
      expect(aggregate.updatedBy).toBe('user-admin');
      expect(aggregate.isPendingSync).toBe(true);
    });

    it('should normalize unanchored scope to null scopeRefId', () => {
      const aggregate = UserGroupAggregate.create({
        tenantCode: 'tenant-test',
        name: 'Engineering Group',
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: 'dept-eng-01',
        matchingRule: baseMatchingRule,
      });

      const { previousScope, newScope } = aggregate.updateScope({
        scopeType: ScopeType.TENANT_WIDE,
        scopeRefId: 'some-ignored-ref',
      });

      expect(previousScope).toEqual({
        scopeType: ScopeType.DEPARTMENT,
        scopeRefId: 'dept-eng-01',
      });
      expect(newScope).toEqual({
        scopeType: ScopeType.TENANT_WIDE,
        scopeRefId: null,
      });
      expect(aggregate.scopeType).toBe(ScopeType.TENANT_WIDE);
      expect(aggregate.scopeRefId).toBeUndefined();
    });
  });
});
