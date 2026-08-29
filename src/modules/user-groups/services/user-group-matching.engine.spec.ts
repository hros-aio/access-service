import { UserGroupMatchingEngine } from './user-group-matching.engine';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { MatchingRule } from '../domain/value-objects/matching-rule.vo';

describe('UserGroupMatchingEngine', () => {
  let engine: UserGroupMatchingEngine;

  beforeEach(() => {
    engine = new UserGroupMatchingEngine();
  });

  const baseEmployee: Partial<EmployeeReference> = {
    employeeId: 'emp-1',
    tenantCode: 'DEFAULT',
    departmentId: 'dept-100',
    locationId: 'loc-100',
    employmentStatus: 'ACTIVE',
    reporteesCount: 2,
  };

  it('evaluates true when all AND clauses match in-memory', () => {
    const rule: MatchingRule = {
      combinator: 'all',
      clauses: [
        { attribute: 'departmentId', operator: 'eq', value: 'dept-100' },
        { attribute: 'employmentStatus', operator: 'eq', value: 'ACTIVE' },
        { attribute: 'hasReportees', operator: 'is_true' },
      ],
    };

    expect(engine.evaluate(rule, baseEmployee as EmployeeReference)).toBe(true);
  });

  it('evaluates false when any clause fails', () => {
    const rule: MatchingRule = {
      combinator: 'all',
      clauses: [
        { attribute: 'departmentId', operator: 'eq', value: 'dept-100' },
        { attribute: 'employmentStatus', operator: 'eq', value: 'INACTIVE' },
      ],
    };

    expect(engine.evaluate(rule, baseEmployee as EmployeeReference)).toBe(false);
  });

  it('builds parameterized SQL query correctly', () => {
    const rule: MatchingRule = {
      combinator: 'all',
      clauses: [
        { attribute: 'departmentId', operator: 'eq', value: 'dept-100' },
        { attribute: 'hasReportees', operator: 'is_true' },
      ],
    };

    const query = engine.buildMatchingQuery('DEFAULT', rule);
    expect(query.sql).toContain('tenant_code = $1');
    expect(query.sql).toContain('department_id = $2');
    expect(query.sql).toContain('reportees_count > 0');
    expect(query.params).toEqual(['DEFAULT', 'dept-100']);
  });
});
