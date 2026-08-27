import { InvalidMatchingRuleError } from '../domain/exceptions/user-group.exceptions';
import { MatchingRuleValidator } from '../domain/validators/matching-rule.validator';

describe('MatchingRuleValidator', () => {
  it('should successfully validate a well-formed matching rule and extract distinct attribute keys', () => {
    const validRule = {
      clauses: [
        {
          attribute: 'employmentStatus',
          operator: 'EQUALS',
          value: 'ACTIVE',
        },
        {
          attribute: 'departmentId',
          operator: 'IN',
          values: ['dept-1', 'dept-2'],
        },
        {
          attribute: 'hasReportees',
          operator: 'IS_TRUE',
        },
        {
          attribute: 'employmentStatus',
          operator: 'NOT_EQUALS',
          value: 'TERMINATED',
        },
      ],
    };

    const result = MatchingRuleValidator.validate(validRule);
    expect(result.ruleAttributeKeys).toEqual(['employmentStatus', 'departmentId', 'hasReportees']);
  });

  it('should throw InvalidMatchingRuleError when rule is null or empty', () => {
    expect(() => MatchingRuleValidator.validate(null)).toThrow(InvalidMatchingRuleError);
    expect(() => MatchingRuleValidator.validate({})).toThrow(InvalidMatchingRuleError);
    expect(() => MatchingRuleValidator.validate({ clauses: [] })).toThrow(InvalidMatchingRuleError);
  });

  it('should throw InvalidMatchingRuleError for unsupported attribute keys', () => {
    const invalidRule = {
      clauses: [
        {
          attribute: 'salary',
          operator: 'GREATER_THAN',
          value: 50000,
        },
      ],
    };

    expect(() => MatchingRuleValidator.validate(invalidRule)).toThrow(InvalidMatchingRuleError);
  });

  it('should throw InvalidMatchingRuleError for unsupported operator', () => {
    const invalidRule = {
      clauses: [
        {
          attribute: 'departmentId',
          operator: 'LIKE',
          value: 'engineering%',
        },
      ],
    };

    expect(() => MatchingRuleValidator.validate(invalidRule)).toThrow(InvalidMatchingRuleError);
  });

  it('should throw InvalidMatchingRuleError for IN operator without values array', () => {
    const invalidRule = {
      clauses: [
        {
          attribute: 'departmentId',
          operator: 'IN',
          values: [],
        },
      ],
    };

    expect(() => MatchingRuleValidator.validate(invalidRule)).toThrow(InvalidMatchingRuleError);
  });
});
