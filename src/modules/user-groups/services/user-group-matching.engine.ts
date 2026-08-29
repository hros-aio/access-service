import { Injectable } from '@nestjs/common';

import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { MatchingRule, MatchingRuleClause } from '../domain/value-objects/matching-rule.vo';

@Injectable()
export class UserGroupMatchingEngine {
  /**
   * Pure in-memory evaluator: determines if an employee projection matches a rule.
   */
  evaluate(rule: MatchingRule, employee: EmployeeReference): boolean {
    if (!rule || !Array.isArray(rule.clauses) || rule.clauses.length === 0) {
      return false;
    }

    // Strictly AND (all) combinator logic
    return rule.clauses.every((clause) => this.evaluateClause(clause, employee));
  }

  private evaluateClause(clause: MatchingRuleClause, employee: EmployeeReference): boolean {
    const attribute = clause.attribute;
    if (!attribute) return false;

    const op = clause.operator.toLowerCase();

    // Special virtual/derived attribute: hasReportees
    if (attribute === 'hasReportees') {
      const reporteesCount = employee.reporteesCount || 0;
      if (op === 'is_true' || op === 'eq' || op === 'equals') {
        const expected = clause.value !== undefined ? Boolean(clause.value) : true;
        return expected ? reporteesCount > 0 : reporteesCount === 0;
      }
      if (op === 'is_false') {
        return reporteesCount === 0;
      }
    }

    const employeeValue = this.extractEmployeeValue(attribute, employee);

    switch (op) {
      case 'eq':
      case 'equals':
        return String(employeeValue) === String(clause.value);

      case 'neq':
      case 'not_equals':
        return String(employeeValue) !== String(clause.value);

      case 'in': {
        const values = (clause.values || []).map((v) => String(v));
        return (
          employeeValue !== null &&
          employeeValue !== undefined &&
          values.includes(String(employeeValue))
        );
      }

      case 'not_in': {
        const values = (clause.values || []).map((v) => String(v));
        return (
          employeeValue === null ||
          employeeValue === undefined ||
          !values.includes(String(employeeValue))
        );
      }

      case 'gt':
      case 'greater_than':
        return Number(employeeValue) > Number(clause.value);

      case 'gte':
      case 'greater_than_or_equal':
        return Number(employeeValue) >= Number(clause.value);

      case 'lt':
      case 'less_than':
        return Number(employeeValue) < Number(clause.value);

      case 'lte':
      case 'less_than_or_equal':
        return Number(employeeValue) <= Number(clause.value);

      case 'is_true':
        return Boolean(employeeValue) === true;

      case 'is_false':
        return Boolean(employeeValue) === false;

      case 'exists':
        return employeeValue !== null && employeeValue !== undefined && employeeValue !== '';

      default:
        return false;
    }
  }

  private extractEmployeeValue(attribute: string, employee: EmployeeReference): unknown {
    switch (attribute) {
      case 'employmentStatus':
        return employee.employmentStatus;
      case 'companyId':
        return employee.companyId;
      case 'locationId':
        return employee.locationId;
      case 'departmentId':
        return employee.departmentId;
      case 'gradeId':
        return employee.gradeId;
      case 'jobTitleId':
        return employee.jobTitleId;
      case 'reporteesCount':
        return employee.reporteesCount;
      default:
        return (employee as unknown as Record<string, unknown>)[attribute];
    }
  }

  /**
   * Translates a matching rule into a safe, parameterized SQL WHERE clause against employee_references.
   */
  buildMatchingQuery(tenantCode: string, rule: MatchingRule): { sql: string; params: unknown[] } {
    const params: unknown[] = [tenantCode];
    const conditions: string[] = ['tenant_code = $1'];

    for (const clause of rule.clauses || []) {
      const attribute = clause.attribute;
      if (!attribute) continue;

      const column = this.mapAttributeToColumn(attribute);
      const op = clause.operator.toLowerCase();

      if (attribute === 'hasReportees') {
        if (op === 'is_true' || (op === 'eq' && clause.value === true)) {
          conditions.push('reportees_count > 0');
        } else if (op === 'is_false' || (op === 'eq' && clause.value === false)) {
          conditions.push('reportees_count = 0');
        }
        continue;
      }

      if (!column) continue;

      switch (op) {
        case 'eq':
        case 'equals':
          params.push(clause.value);
          conditions.push(`${column} = $${params.length}`);
          break;

        case 'neq':
        case 'not_equals':
          params.push(clause.value);
          conditions.push(`(${column} IS NULL OR ${column} != $${params.length})`);
          break;

        case 'in':
          params.push(clause.values || []);
          conditions.push(`${column} = ANY($${params.length})`);
          break;

        case 'not_in':
          params.push(clause.values || []);
          conditions.push(`(${column} IS NULL OR NOT (${column} = ANY($${params.length})))`);
          break;

        case 'gt':
        case 'greater_than':
          params.push(clause.value);
          conditions.push(`${column} > $${params.length}`);
          break;

        case 'gte':
        case 'greater_than_or_equal':
          params.push(clause.value);
          conditions.push(`${column} >= $${params.length}`);
          break;

        case 'lt':
        case 'less_than':
          params.push(clause.value);
          conditions.push(`${column} < $${params.length}`);
          break;

        case 'lte':
        case 'less_than_or_equal':
          params.push(clause.value);
          conditions.push(`${column} <= $${params.length}`);
          break;

        case 'exists':
          conditions.push(`${column} IS NOT NULL AND ${column} != ''`);
          break;
      }
    }

    const sql = `SELECT employee_id FROM employee_references WHERE ${conditions.join(' AND ')}`;
    return { sql, params };
  }

  private mapAttributeToColumn(attribute: string): string | null {
    switch (attribute) {
      case 'employmentStatus':
        return 'employment_status';
      case 'companyId':
        return 'company_id';
      case 'locationId':
        return 'location_id';
      case 'departmentId':
        return 'department_id';
      case 'gradeId':
        return 'grade_id';
      case 'jobTitleId':
        return 'job_title_id';
      case 'reporteesCount':
        return 'reportees_count';
      default:
        return null;
    }
  }
}
