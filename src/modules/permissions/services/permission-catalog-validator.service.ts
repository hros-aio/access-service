import { Injectable, Logger } from '@nestjs/common';

import {
  CyclicPermissionDependencyError,
  DanglingPermissionPrerequisiteError,
} from '../errors/permission-catalog.errors';
import { PermissionDefinition } from '../interfaces/permission-definition.interface';
import { PermissionDependencyGraph } from '../interfaces/permission-dependency-graph.interface';

@Injectable()
export class PermissionCatalogValidator {
  private readonly logger = new Logger(PermissionCatalogValidator.name);

  public validate(
    definitions: readonly PermissionDefinition[],
    graph: PermissionDependencyGraph,
  ): void {
    this.validateReferentialIntegrity(definitions, graph);
    this.detectCycles(graph);
    this.logger.log(
      `Permission catalog validation succeeded for ${definitions.length} capabilities.`,
    );
  }

  public validateReferentialIntegrity(
    definitions: readonly PermissionDefinition[],
    graph: PermissionDependencyGraph,
  ): void {
    const validCodes = new Set(definitions.map((d) => d.id));

    for (const def of definitions) {
      if (def.requires && def.requires.length > 0) {
        for (const req of def.requires) {
          if (!validCodes.has(req)) {
            throw new DanglingPermissionPrerequisiteError(def.id, req);
          }
          const target = graph.nodes.get(req);
          if (target && target.definition.deprecated) {
            throw new DanglingPermissionPrerequisiteError(
              def.id,
              `${req} (prerequisite is deprecated)`,
            );
          }
        }
      }
    }
  }

  public detectCycles(graph: PermissionDependencyGraph): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      currentPath.push(nodeId);

      const neighbors = graph.adjacencyList.get(nodeId) || new Set<string>();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          const cycleStartIndex = currentPath.indexOf(neighbor);
          const cyclePath = [...currentPath.slice(cycleStartIndex), neighbor];
          throw new CyclicPermissionDependencyError(cyclePath);
        }
      }

      currentPath.pop();
      recursionStack.delete(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
  }
}
