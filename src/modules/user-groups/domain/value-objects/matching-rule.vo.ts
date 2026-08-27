export type MatchingRuleOperator =
  'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN' | 'IS_TRUE' | 'IS_FALSE';

export interface MatchingRuleClause {
  attribute: string;
  operator: MatchingRuleOperator;
  value?: string | number | boolean;
  values?: Array<string | number>;
}

export interface MatchingRule {
  clauses: MatchingRuleClause[];
}
