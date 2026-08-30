# Quickstart Guide: Multi-Group Cumulative Access Evaluation

This guide outlines runnable scenarios to validate cumulative multi-group permission and scope resolution, cache synchronization, and guard enforcement.

---

## Prerequisites

1. PostgreSQL database running with migrations applied.
2. Redis running and accessible via connection configuration.
3. Access Service running (`npm run start:dev`).

---

## Scenario 1: Cumulative Scope Union Validation (Unit / In-Memory)

Test `CumulativeAccessEvaluator` with multiple roles:

```typescript
const evaluator = new CumulativeAccessEvaluator();

const userRoles = [
  { roleId: 'role-emp', scope: { type: 'SELF', refId: null }, sourceGroupId: 'group-1' },
  {
    roleId: 'role-mgr',
    scope: { type: 'DIRECT_REPORTEES', refId: null },
    sourceGroupId: 'group-2',
  },
];

const rolePermissionsMap = new Map([
  ['role-emp', ['employee.view', 'leave.apply']],
  ['role-mgr', ['employee.view', 'leave.approve']],
]);

// 1. Direct Report Access
const canViewReport = evaluator.evaluateAccess(
  'employee.view',
  userRoles,
  rolePermissionsMap,
  { employeeId: 'emp-2', managerId: 'current-user-emp-id' },
  'current-user-emp-id',
);
// Expected: true (Satisfies DIRECT_REPORTEES scope)

// 2. Self Access
const canViewSelf = evaluator.evaluateAccess(
  'employee.view',
  userRoles,
  rolePermissionsMap,
  { employeeId: 'current-user-emp-id' },
  'current-user-emp-id',
);
// Expected: true (Satisfies SELF scope)

// 3. Unrelated Peer Access
const canViewPeer = evaluator.evaluateAccess(
  'employee.view',
  userRoles,
  rolePermissionsMap,
  { employeeId: 'peer-id', managerId: 'other-mgr-id' },
  'current-user-emp-id',
);
// Expected: false (Fails both SELF and DIRECT_REPORTEES)
```

---

## Scenario 2: Materialization and Projection Update

1. Assign user to User Group A (`Role: Employee`) and User Group B (`Role: Manager`).
2. Trigger `EffectiveRoleProjectionService.recomputeUserEffectiveRoles(tenantCode, userId)`.
3. Verify that `user_effective_roles` table contains 2 records for the user.
4. Verify that Redis key `authz:user:{tenantCode}:{userId}` is updated with the 2 roles and incremented version.

---

## Scenario 3: Session Bootstrap Endpoint

Execute HTTP request:

```bash
curl -X GET http://localhost:3000/auth/bootstrap/capabilities \
  -H "Authorization: Bearer <VALID_JWT>" \
  -H "Content-Type: application/json"
```

Verify response payload contains deduplicated `permissions`, `modules`, `roles`, and `authorizationVersion`.
