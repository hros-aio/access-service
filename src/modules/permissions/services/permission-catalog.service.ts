import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PermissionCatalogValidator } from './permission-catalog-validator.service';
import {
  ModuleGroupDto,
  PermissionCatalogResponseDto,
  PermissionDependenciesResponseDto,
  DependencyRuleDto,
} from '../dto/permission-catalog-response.dto';
import { PermissionDefinition } from '../interfaces/permission-definition.interface';
import { PermissionDependencyGraph } from '../interfaces/permission-dependency-graph.interface';
import { PermissionCatalogLoader } from '../loaders/permission-catalog.loader';

@Injectable()
export class PermissionCatalogService implements OnModuleInit {
  private readonly logger = new Logger(PermissionCatalogService.name);
  private definitions: readonly PermissionDefinition[] = [];
  private graph!: PermissionDependencyGraph;

  constructor(
    private readonly loader: PermissionCatalogLoader,
    private readonly validator: PermissionCatalogValidator,
  ) {}

  public onModuleInit(): void {
    this.initialize();
  }

  public initialize(customFilePath?: string): void {
    const loaded = this.loader.loadFromFile(customFilePath);
    this.validator.validate(loaded.definitions, loaded.graph);

    this.definitions = loaded.definitions;
    this.graph = loaded.graph;
    this.logger.log(
      `Permission catalog initialized and indexed successfully (${this.definitions.length} permissions).`,
    );
  }

  public getAll(): readonly PermissionDefinition[] {
    return this.definitions;
  }

  public getById(id: string): PermissionDefinition | undefined {
    return this.loader.getById(id);
  }

  public getGraph(): PermissionDependencyGraph {
    return this.graph;
  }

  public getCatalogHierarchy(): PermissionCatalogResponseDto {
    const moduleMap = this.loader.getModuleMap();
    const modules: ModuleGroupDto[] = [];

    for (const [moduleName, resourceMap] of moduleMap.entries()) {
      const resources = [];
      for (const [resourceName, perms] of resourceMap.entries()) {
        resources.push({
          resource: resourceName,
          permissions: perms.map((p) => ({
            id: p.id,
            module: p.module,
            resource: p.resource,
            action: p.action,
            requires: p.requires ? [...p.requires] : undefined,
            entry: p.entry,
            deprecated: p.deprecated,
            deprecatedAt: p.deprecatedAt,
            removedInVersion: p.removedInVersion,
          })),
        });
      }
      modules.push({
        module: moduleName,
        resources,
      });
    }

    return {
      totalModules: modules.length,
      totalPermissions: this.definitions.length,
      modules,
    };
  }

  public getDependencyMatrix(): PermissionDependenciesResponseDto {
    const dependencies: DependencyRuleDto[] = [];

    for (const [id, node] of this.graph.nodes.entries()) {
      dependencies.push({
        permissionCode: id,
        requires: Array.from(node.prerequisites),
        requiredBy: Array.from(node.dependents),
      });
    }

    return { dependencies };
  }
}
