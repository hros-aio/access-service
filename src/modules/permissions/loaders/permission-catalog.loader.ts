import * as fs from 'fs';
import * as path from 'path';

import * as yaml from 'js-yaml';

import { PermissionGraphBuilder } from './permission-graph-builder';
import {
  PERMISSION_ACTION_REGEX,
  PROHIBITED_EVENT_ACTION_SUFFIXES,
} from '../constants/permission-catalog.constants';
import { InvalidPermissionFormatError } from '../errors/permission-catalog.errors';
import { PermissionDefinition } from '../interfaces/permission-definition.interface';
import { PermissionDependencyGraph } from '../interfaces/permission-dependency-graph.interface';

interface RawCatalogYaml {
  permissions: Array<{
    id: string;
    module: string;
    resource: string;
    action: string;
    requires?: string[];
    entry?: boolean;
    deprecated?: boolean;
    deprecatedAt?: string;
    removedInVersion?: string;
  }>;
}

export class PermissionCatalogLoader {
  private readonly permissionMap = new Map<string, PermissionDefinition>();
  private readonly moduleMap = new Map<string, Map<string, PermissionDefinition[]>>();
  private graph: PermissionDependencyGraph | null = null;

  public loadFromYamlContent(yamlContent: string): {
    definitions: readonly PermissionDefinition[];
    map: ReadonlyMap<string, PermissionDefinition>;
    graph: PermissionDependencyGraph;
  } {
    this.permissionMap.clear();
    this.moduleMap.clear();

    const parsed = yaml.load(yamlContent) as RawCatalogYaml;
    if (!parsed || !Array.isArray(parsed.permissions)) {
      throw new Error('Invalid catalog YAML structure: missing permissions array.');
    }

    const definitions: PermissionDefinition[] = [];

    for (const raw of parsed.permissions) {
      this.validatePermissionNaming(raw.id, raw.resource, raw.action);

      const def: PermissionDefinition = {
        id: raw.id,
        module: raw.module,
        resource: raw.resource,
        action: raw.action,
        requires: raw.requires ? Object.freeze([...raw.requires]) : undefined,
        entry: raw.entry === true,
        deprecated: raw.deprecated === true,
        deprecatedAt: raw.deprecatedAt,
        removedInVersion: raw.removedInVersion,
      };

      Object.freeze(def);
      definitions.push(def);
      this.permissionMap.set(def.id, def);

      if (!this.moduleMap.has(def.module)) {
        this.moduleMap.set(def.module, new Map<string, PermissionDefinition[]>());
      }
      const resourceMap = this.moduleMap.get(def.module)!;
      if (!resourceMap.has(def.resource)) {
        resourceMap.set(def.resource, []);
      }
      resourceMap.get(def.resource)!.push(def);
    }

    const frozenDefinitions = Object.freeze(definitions);
    this.graph = PermissionGraphBuilder.buildGraph(frozenDefinitions);

    return {
      definitions: frozenDefinitions,
      map: this.permissionMap,
      graph: this.graph,
    };
  }

  public loadFromFile(filePath?: string): {
    definitions: readonly PermissionDefinition[];
    map: ReadonlyMap<string, PermissionDefinition>;
    graph: PermissionDependencyGraph;
  } {
    const candidatePaths = filePath
      ? [filePath]
      : [
          path.resolve(__dirname, '../config/permission-catalog.yaml'),
          path.resolve(__dirname, '../../config/permission-catalog.yaml'),
          path.resolve(process.cwd(), 'src/modules/permissions/config/permission-catalog.yaml'),
          path.resolve(
            process.cwd(),
            'dist/src/modules/permissions/config/permission-catalog.yaml',
          ),
          path.resolve(process.cwd(), 'dist/modules/permissions/config/permission-catalog.yaml'),
        ];

    const targetPath = candidatePaths.find((p) => fs.existsSync(p));

    if (!targetPath) {
      throw new Error(
        `Permission catalog YAML file not found. Tried paths: ${candidatePaths.join(', ')}`,
      );
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    return this.loadFromYamlContent(content);
  }

  public getById(id: string): PermissionDefinition | undefined {
    return this.permissionMap.get(id);
  }

  public getAll(): readonly PermissionDefinition[] {
    return Array.from(this.permissionMap.values());
  }

  public getModuleMap(): ReadonlyMap<string, ReadonlyMap<string, readonly PermissionDefinition[]>> {
    return this.moduleMap;
  }

  public getGraph(): PermissionDependencyGraph {
    if (!this.graph) {
      throw new Error('Permission graph has not been loaded yet.');
    }
    return this.graph;
  }

  private validatePermissionNaming(id: string, resource: string, action: string): void {
    if (!id || !PERMISSION_ACTION_REGEX.test(id)) {
      throw new InvalidPermissionFormatError(
        id,
        `Permission ID '${id}' must match pattern 'resource.action' with lowercase alphanumeric characters.`,
      );
    }

    const expectedId = `${resource}.${action}`;
    if (id !== expectedId) {
      throw new InvalidPermissionFormatError(
        id,
        `Permission ID '${id}' does not match expected concatenation '${expectedId}'.`,
      );
    }

    if (PROHIBITED_EVENT_ACTION_SUFFIXES.includes(action.toLowerCase())) {
      throw new InvalidPermissionFormatError(
        id,
        `Permission action '${action}' uses past-tense event naming which is strictly prohibited. Use present-tense imperative action verbs (e.g. 'create', 'update', 'view').`,
      );
    }
  }
}
