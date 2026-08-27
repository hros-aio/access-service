import { InvalidMatchingRuleError } from '../exceptions/user-group.exceptions';
import {
  MatchingRule,
  MatchingRuleClause,
  MatchingRuleOperator,
} from '../value-objects/matching-rule.vo';

export class MatchingRuleValidator {
  public static readonly ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
    'employmentStatus',
    'companyId',
    'locationId',
    'departmentId',
    'gradeId',
    'jobTitleId',
    'reporteesCount',
    'hasReportees',
  ]);

  public static readonly ALLOWED_OPERATORS: ReadonlySet<MatchingRuleOperator> = new Set([
    'EQUALS',
    'NOT_EQUALS',
    'IN',
    'NOT_IN',
    'GREATER_THAN',
    'LESS_THAN',
    'IS_TRUE',
    'IS_FALSE',
  ]);

  /**
   * Validates the structure and clauses of a matching rule.
   * Throws InvalidMatchingRuleError on any schema or allow-list violation.
   */
  public static validate(matchingRule: unknown): { ruleAttributeKeys: string[] } {
    if (!matchingRule || typeof matchingRule !== 'object') {
      throw new InvalidMatchingRuleError('Matching rule must be a non-null object');
    }

    const rule = matchingRule as MatchingRule;
    if (!Array.isArray(rule.clauses)) {
      throw new InvalidMatchingRuleError('Matching rule must contain an array of clauses');
    }

    if (rule.clauses.length === 0) {
      throw new InvalidMatchingRuleError('Matching rule must contain at least one clause');
    }

    const attributeKeySet = new Set<string>();

    for (let i = 0; i < rule.clauses.length; i++) {
      const clause = rule.clauses[i];
      this.validateClause(clause, i);
      attributeKeySet.add(clause.attribute);
    }

    return {
      ruleAttributeKeys: Array.from(attributeKeySet),
    };
  }

  private static validateClause(clause: unknown, index: number): void {
    if (!clause || typeof clause !== 'object') {
      throw new InvalidMatchingRuleError(`Clause at index ${index} must be a non-null object`);
    }

    const c = clause as MatchingRuleClause;

    if (!c.attribute || typeof c.attribute !== 'string') {
      throw new InvalidMatchingRuleError(
        `Clause at index ${index} is missing a valid 'attribute' property`,
      );
    }

    if (!this.ALLOWED_ATTRIBUTES.has(c.attribute)) {
      throw new InvalidMatchingRuleError(
        `Attribute "${c.attribute}" at index ${index} is not in the allowed employee attribute list (${Array.from(
          this.ALLOWED_ATTRIBUTES,
        ).join(', ')})`,
      );
    }

    if (!c.operator || !this.ALLOWED_OPERATORS.has(c.operator)) {
      throw new InvalidMatchingRuleError(
        `Operator "${c.operator}" at index ${index} is not a supported operator (${Array.from(
          this.ALLOWED_OPERATORS,
        ).join(', ')})`,
      );
    }

    // Operator-specific payload checks
    if (c.operator === 'IN' || c.operator === 'NOT_IN') {
      if (!Array.isArray(c.values) || c.values.length === 0) {
        throw new InvalidMatchingRuleError(
          `Operator "${c.operator}" at index ${index} requires a non-empty "values" array`,
        );
      }
    } else if (c.operator === 'IS_TRUE' || c.operator === 'IS_FALSE') {
      // boolean flag operators require no specific value or can have boolean value
    } else {
      if (c.value === undefined || c.value === null || c.value === '') {
        throw new InvalidMatchingRuleError(
          `Operator "${c.operator}" at index ${index} requires a defined "value" property`,
        );
      }
    }
  }
}
