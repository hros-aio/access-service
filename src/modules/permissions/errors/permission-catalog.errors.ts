export class InvalidPermissionFormatError extends Error {
  constructor(
    public readonly permissionId: string,
    message?: string,
  ) {
    super(
      message ||
        `Permission ID '${permissionId}' is invalid. Permissions must follow action-oriented 'resource.action' naming (e.g. 'location.view'). Past-tense event naming is strictly prohibited.`,
    );
    this.name = 'InvalidPermissionFormatError';
  }
}

export class DanglingPermissionPrerequisiteError extends Error {
  constructor(
    public readonly permissionId: string,
    public readonly missingPrerequisiteId: string,
  ) {
    super(
      `Permission '${permissionId}' references non-existent or deprecated prerequisite '${missingPrerequisiteId}'.`,
    );
    this.name = 'DanglingPermissionPrerequisiteError';
  }
}

export class CyclicPermissionDependencyError extends Error {
  constructor(public readonly cyclePath: readonly string[]) {
    super(`Cyclic dependency detected in permission catalog: ${cyclePath.join(' -> ')}`);
    this.name = 'CyclicPermissionDependencyError';
  }
}

export class InvalidPermissionCodeError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message || `Permission code '${code}' is unknown or deprecated.`);
    this.name = 'InvalidPermissionCodeError';
  }
}
