import { InvalidMatchingRuleError } from '../domain/exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';

describe('MatchingRuleValidator', () => {
  it('validates a valid matching rule with field and operator', () => {
    const rule = {
      combinator: 'all',
      clauses: [
        { field: 'departmentId', operator: 'eq', value: 'dept-123' },
        { field: 'employmentStatus', operator: 'in', values: ['ACTIVE', 'ON_LEAVE'] },
        { field: 'hasReportees', operator: 'is_true' },
      ],
    };

    const result = MatchingRuleValidator.validate(rule);
    expect(result.ruleAttributeKeys).toEqual(
      expect.arrayContaining(['departmentId', 'employmentStatus', 'hasReportees']),
    );
  });

  it('rejects unsupported combinators like "any" or "or"', () => {
    const rule = {
      combinator: 'any',
      clauses: [{ field: 'departmentId', operator: 'eq', value: 'dept-123' }],
    };

    expect(() => MatchingRuleValidator.validate(rule)).toThrow(InvalidMatchingRuleError);
  });

  it('rejects unallowed attributes like salary', () => {
    const rule = {
      combinator: 'all',
      clauses: [{ field: 'salary', operator: 'eq', value: 1000 }],
    };

    expect(() => MatchingRuleValidator.validate(rule)).toThrow(InvalidMatchingRuleError);
  });

  it('rejects empty clauses', () => {
    const rule = {
      combinator: 'all',
      clauses: [],
    };

    expect(() => MatchingRuleValidator.validate(rule)).toThrow(InvalidMatchingRuleError);
  });
});
