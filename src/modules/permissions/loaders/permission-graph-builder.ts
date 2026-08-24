import { PermissionDefinition } from '../interfaces/permission-definition.interface';
import {
  DependencyNode,
  PermissionDependencyGraph,
} from '../interfaces/permission-dependency-graph.interface';

export class PermissionGraphBuilder {
  public static buildGraph(
    definitions: readonly PermissionDefinition[],
  ): PermissionDependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const adjacencyList = new Map<string, Set<string>>();
    const reverseAdjacencyList = new Map<string, Set<string>>();

    for (const def of definitions) {
      adjacencyList.set(def.id, new Set<string>());
      reverseAdjacencyList.set(def.id, new Set<string>());
    }

    for (const def of definitions) {
      const prerequisites = new Set<string>(def.requires || []);
      for (const req of prerequisites) {
        adjacencyList.get(def.id)?.add(req);
        if (!reverseAdjacencyList.has(req)) {
          reverseAdjacencyList.set(req, new Set<string>());
        }
        reverseAdjacencyList.get(req)?.add(def.id);
      }
    }

    for (const def of definitions) {
      const prereqs = adjacencyList.get(def.id) || new Set<string>();
      const dependents = reverseAdjacencyList.get(def.id) || new Set<string>();

      nodes.set(def.id, {
        id: def.id,
        definition: def,
        prerequisites: prereqs,
        dependents: dependents,
      });
    }

    return {
      nodes,
      adjacencyList,
      reverseAdjacencyList,
    };
  }
}
