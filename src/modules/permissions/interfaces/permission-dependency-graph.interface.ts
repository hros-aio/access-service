import { PermissionDefinition } from './permission-definition.interface';

export interface DependencyNode {
  readonly id: string;
  readonly definition: PermissionDefinition;
  readonly prerequisites: ReadonlySet<string>;
  readonly dependents: ReadonlySet<string>;
}

export interface PermissionDependencyGraph {
  readonly nodes: ReadonlyMap<string, DependencyNode>;
  readonly adjacencyList: ReadonlyMap<string, ReadonlySet<string>>;
  readonly reverseAdjacencyList: ReadonlyMap<string, ReadonlySet<string>>;
}
