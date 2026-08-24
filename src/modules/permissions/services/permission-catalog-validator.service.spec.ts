import * as path from 'path';

import { PermissionCatalogValidator } from './permission-catalog-validator.service';
import {
  CyclicPermissionDependencyError,
  DanglingPermissionPrerequisiteError,
} from '../errors/permission-catalog.errors';
import { PermissionCatalogLoader } from '../loaders/permission-catalog.loader';

describe('PermissionCatalogValidator', () => {
  let validator: PermissionCatalogValidator;
  let loader: PermissionCatalogLoader;

  beforeEach(() => {
    validator = new PermissionCatalogValidator();
    loader = new PermissionCatalogLoader();
  });

  it('should pass validation for valid acyclic catalog', () => {
    const validYaml = `
permissions:
  - id: location.view
    module: setting
    resource: location
    action: view
  - id: location.create
    module: setting
    resource: location
    action: create
    requires: [location.view]
`;
    const { definitions, graph } = loader.loadFromYamlContent(validYaml);
    expect(() => validator.validate(definitions, graph)).not.toThrow();
  });

  it('should throw DanglingPermissionPrerequisiteError on missing prerequisite', () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../test/permissions/fixtures/dangling-catalog.yaml',
    );
    const { definitions, graph } = loader.loadFromFile(fixturePath);

    expect(() => validator.validate(definitions, graph)).toThrow(
      DanglingPermissionPrerequisiteError,
    );
  });

  it('should throw CyclicPermissionDependencyError on cyclic dependency chain', () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../test/permissions/fixtures/cyclic-catalog.yaml',
    );
    const { definitions, graph } = loader.loadFromFile(fixturePath);

    expect(() => validator.validate(definitions, graph)).toThrow(CyclicPermissionDependencyError);
  });
});
