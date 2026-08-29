export type MatchingRuleOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'IN'
  | 'NOT_IN'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'IS_TRUE'
  | 'IS_FALSE'
  | 'EXISTS'
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_true'
  | 'is_false'
  | 'exists';

export type AttributeKey =
  | 'employmentStatus'
  | 'companyId'
  | 'locationId'
  | 'departmentId'
  | 'gradeId'
  | 'jobTitleId'
  | 'reporteesCount'
  | 'hasReportees';

export interface MatchingRuleClause {
  attribute: string;
  operator: MatchingRuleOperator;
  value?: string | number | boolean;
  values?: Array<string | number>;
}

export interface MatchingRule {
  combinator?: 'all' | 'ALL' | string;
  clauses: MatchingRuleClause[];
}
