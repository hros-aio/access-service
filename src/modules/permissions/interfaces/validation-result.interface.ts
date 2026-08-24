export type DependencyViolationType =
  | 'MISSING_PREREQUISITE'
  | 'BLOCKED_BY_DEPENDENT'
  | 'DEPRECATED_CODE'
  | 'UNKNOWN_CODE'
  | 'INVALID_FORMAT';

export interface DependencyViolation {
  readonly code: string;
  readonly type: DependencyViolationType;
  readonly message: string;
  readonly conflictCodes?: readonly string[];
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly DependencyViolation[];
}
