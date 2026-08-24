export interface PermissionDefinition {
  readonly id: string;
  readonly module: string;
  readonly resource: string;
  readonly action: string;
  readonly requires?: readonly string[];
  readonly entry?: boolean;
  readonly deprecated?: boolean;
  readonly deprecatedAt?: string;
  readonly removedInVersion?: string;
}

export interface ModuleResourceGroup {
  readonly module: string;
  readonly resources: {
    readonly resource: string;
    readonly permissions: readonly PermissionDefinition[];
  }[];
}
