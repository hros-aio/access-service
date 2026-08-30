import { CumulativeAccessEvaluator } from './cumulative-access-evaluator.service';
import { EffectiveUserRole } from '../interfaces/effective-user-role.interface';

describe('CumulativeAccessEvaluator', () => {
  let evaluator: CumulativeAccessEvaluator;

  const currentUserId = 'emp-current';

  const userRoles: EffectiveUserRole[] = [
    {
      roleId: 'role-emp',
      scope: { type: 'SELF', refId: null },
      sourceGroupId: 'group-1',
    },
    {
      roleId: 'role-mgr',
      scope: { type: 'DIRECT_REPORTEES', refId: null },
      sourceGroupId: 'group-2',
    },
    {
      roleId: 'role-regional-lead',
      scope: { type: 'LOCATION', refId: 'loc-berlin' },
      sourceGroupId: 'group-3',
    },
  ];

  const rolePermissionsMap = new Map<string, string[]>([
    ['role-emp', ['employee.view', 'leave.apply']],
    ['role-mgr', ['employee.view', 'leave.approve', 'team.performance']],
    ['role-regional-lead', ['employee.view', 'site.manage']],
  ]);

  beforeEach(() => {
    evaluator = new CumulativeAccessEvaluator();
  });

  it('should grant access to self profile via SELF scope', () => {
    const result = evaluator.evaluateAccess(
      'employee.view',
      userRoles,
      rolePermissionsMap,
      { employeeId: 'emp-current' },
      currentUserId,
    );
    expect(result).toBe(true);
  });

  it('should grant access to direct report via DIRECT_REPORTEES scope', () => {
    const result = evaluator.evaluateAccess(
      'employee.view',
      userRoles,
      rolePermissionsMap,
      { employeeId: 'emp-reportee', managerId: 'emp-current' },
      currentUserId,
    );
    expect(result).toBe(true);
  });

  it('should grant access to employee in Berlin via LOCATION scope', () => {
    const result = evaluator.evaluateAccess(
      'employee.view',
      userRoles,
      rolePermissionsMap,
      { employeeId: 'emp-berlin', locationId: 'loc-berlin', managerId: 'other-manager' },
      currentUserId,
    );
    expect(result).toBe(true);
  });

  it('should deny access to unrelated peer outside self, direct reports, and Berlin', () => {
    const result = evaluator.evaluateAccess(
      'employee.view',
      userRoles,
      rolePermissionsMap,
      { employeeId: 'emp-paris', locationId: 'loc-paris', managerId: 'other-manager' },
      currentUserId,
    );
    expect(result).toBe(false);
  });

  it('should deny when user does not possess required permission across any role', () => {
    const result = evaluator.evaluateAccess(
      'payroll.execute',
      userRoles,
      rolePermissionsMap,
      { employeeId: 'emp-current' },
      currentUserId,
    );
    expect(result).toBe(false);
  });

  it('should deny when user has zero roles', () => {
    const result = evaluator.evaluateAccess(
      'employee.view',
      [],
      rolePermissionsMap,
      { employeeId: 'emp-current' },
      currentUserId,
    );
    expect(result).toBe(false);
  });

  it('should grant access anywhere for TENANT / TENANT_WIDE scope', () => {
    const tenantRoles: EffectiveUserRole[] = [
      {
        roleId: 'role-admin',
        scope: { type: 'TENANT', refId: null },
        sourceGroupId: 'group-admin',
      },
    ];
    const adminPerms = new Map<string, string[]>([['role-admin', ['employee.view']]]);

    const result = evaluator.evaluateAccess(
      'employee.view',
      tenantRoles,
      adminPerms,
      { employeeId: 'any-emp-id' },
      currentUserId,
    );
    expect(result).toBe(true);
  });

  it('should evaluate COMPANY and DEPARTMENT scopes correctly', () => {
    const orgRoles: EffectiveUserRole[] = [
      {
        roleId: 'role-company-hr',
        scope: { type: 'COMPANY', refId: 'comp-singapore' },
        sourceGroupId: 'g-comp',
      },
      {
        roleId: 'role-dept-lead',
        scope: { type: 'DEPARTMENT', refId: 'dept-engineering' },
        sourceGroupId: 'g-dept',
      },
    ];
    const orgPerms = new Map<string, string[]>([
      ['role-company-hr', ['hr.audit']],
      ['role-dept-lead', ['dept.assign']],
    ]);

    // Matching company
    expect(
      evaluator.evaluateAccess(
        'hr.audit',
        orgRoles,
        orgPerms,
        { companyId: 'comp-singapore' },
        currentUserId,
      ),
    ).toBe(true);

    // Mismatched company
    expect(
      evaluator.evaluateAccess(
        'hr.audit',
        orgRoles,
        orgPerms,
        { companyId: 'comp-us' },
        currentUserId,
      ),
    ).toBe(false);

    // Matching department
    expect(
      evaluator.evaluateAccess(
        'dept.assign',
        orgRoles,
        orgPerms,
        { departmentId: 'dept-engineering' },
        currentUserId,
      ),
    ).toBe(true);
  });
});
