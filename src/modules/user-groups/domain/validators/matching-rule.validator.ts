import { InvalidMatchingRuleError } from '../exceptions/user-group.exceptions';
import { MatchingRule, MatchingRuleClause } from '../value-objects/matching-rule.vo';

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

  public static readonly ALLOWED_OPERATORS: ReadonlySet<string> = new Set([
    'equals',
    'not_equals',
    'in',
    'not_in',
    'greater_than',
    'greater_than_or_equal',
    'less_than',
    'less_than_or_equal',
    'is_true',
    'is_false',
    'exists',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
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

    if (rule.combinator && rule.combinator.toLowerCase() !== 'all') {
      throw new InvalidMatchingRuleError(
        `Unsupported combinator "${rule.combinator}". Only "all" (logical AND) is supported.`,
      );
    }

    if (!Array.isArray(rule.clauses)) {
      throw new InvalidMatchingRuleError('Matching rule must contain an array of clauses');
    }

    if (rule.clauses.length === 0) {
      throw new InvalidMatchingRuleError('Matching rule must contain at least one clause');
    }

    const attributeKeySet = new Set<string>();

    for (let i = 0; i < rule.clauses.length; i++) {
      const clause = rule.clauses[i];
      const attr = this.validateClause(clause, i);
      attributeKeySet.add(attr);
    }

    return {
      ruleAttributeKeys: Array.from(attributeKeySet),
    };
  }

  private static validateClause(clause: unknown, index: number): string {
    if (!clause || typeof clause !== 'object') {
      throw new InvalidMatchingRuleError(`Clause at index ${index} must be a non-null object`);
    }

    const c = clause as MatchingRuleClause;
    const attribute = c.field || c.attribute;

    if (!attribute || typeof attribute !== 'string') {
      throw new InvalidMatchingRuleError(
        `Clause at index ${index} is missing a valid 'field' or 'attribute' property`,
      );
    }

    if (!this.ALLOWED_ATTRIBUTES.has(attribute)) {
      throw new InvalidMatchingRuleError(
        `Attribute "${attribute}" at index ${index} is not in the allowed employee attribute list (${Array.from(
          this.ALLOWED_ATTRIBUTES,
        ).join(', ')})`,
      );
    }

    if (!c.operator || typeof c.operator !== 'string') {
      throw new InvalidMatchingRuleError(
        `Clause at index ${index} is missing a valid 'operator' property`,
      );
    }

    const normalizedOp = c.operator.toLowerCase();

    if (!this.ALLOWED_OPERATORS.has(normalizedOp)) {
      throw new InvalidMatchingRuleError(
        `Operator "${c.operator}" at index ${index} is not a supported operator (${Array.from(
          this.ALLOWED_OPERATORS,
        ).join(', ')})`,
      );
    }

    // Operator-specific payload checks
    if (normalizedOp === 'in' || normalizedOp === 'not_in') {
      if (!Array.isArray(c.values) || c.values.length === 0) {
        throw new InvalidMatchingRuleError(
          `Operator "${c.operator}" at index ${index} requires a non-empty "values" array`,
        );
      }
    } else if (
      normalizedOp === 'is_true' ||
      normalizedOp === 'is_false' ||
      normalizedOp === 'exists'
    ) {
      // boolean flag operators require no specific value
    } else {
      if (c.value === undefined || c.value === null || c.value === '') {
        throw new InvalidMatchingRuleError(
          `Operator "${c.operator}" at index ${index} requires a defined "value" property`,
        );
      }
    }

    return attribute;
  }
}
