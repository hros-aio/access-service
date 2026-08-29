import { EmployeeReference } from '../employee/entities/employee-reference.entity';
import { MatchingRuleValidator } from './domain/validators/matching-rule.validator';
import { MatchingRule } from './domain/value-objects/matching-rule.vo';
import { UserGroupMatchingEngine } from './services/user-group-matching.engine';

describe('UserGroupMatching (Integration)', () => {
  let engine: UserGroupMatchingEngine;

  beforeEach(() => {
    engine = new UserGroupMatchingEngine();
  });

  it('completes full validation, in-memory matching, and query translation flow', () => {
    const rawRule: MatchingRule = {
      combinator: 'all',
      clauses: [
        { attribute: 'departmentId', operator: 'eq', value: 'dept-eng' },
        { attribute: 'employmentStatus', operator: 'in', values: ['ACTIVE', 'ON_LEAVE'] },
        { attribute: 'hasReportees', operator: 'is_true' },
      ],
    };

    const validated = MatchingRuleValidator.validate(rawRule);
    expect(validated.ruleAttributeKeys).toEqual([
      'departmentId',
      'employmentStatus',
      'hasReportees',
    ]);

    const matchingEmployee: Partial<EmployeeReference> = {
      employeeId: 'emp-100',
      tenantCode: 'TENANT1',
      departmentId: 'dept-eng',
      employmentStatus: 'ACTIVE',
      reporteesCount: 3,
    };

    const nonMatchingEmployee: Partial<EmployeeReference> = {
      employeeId: 'emp-200',
      tenantCode: 'TENANT1',
      departmentId: 'dept-sales',
      employmentStatus: 'ACTIVE',
      reporteesCount: 0,
    };

    expect(engine.evaluate(rawRule, matchingEmployee as EmployeeReference)).toBe(true);
    expect(engine.evaluate(rawRule, nonMatchingEmployee as EmployeeReference)).toBe(false);

    const query = engine.buildMatchingQuery('TENANT1', rawRule);
    expect(query.sql).toContain('SELECT employee_id FROM employee_references');
    expect(query.params).toEqual(['TENANT1', 'dept-eng', ['ACTIVE', 'ON_LEAVE']]);
  });
});
