import { PermissionCatalogLoader } from './permission-catalog.loader';
import { InvalidPermissionFormatError } from '../errors/permission-catalog.errors';

describe('PermissionCatalogLoader', () => {
  let loader: PermissionCatalogLoader;

  beforeEach(() => {
    loader = new PermissionCatalogLoader();
  });

  it('should successfully parse valid YAML content and build $O(1)$ lookup map', () => {
    const validYaml = `
permissions:
  - id: location.view
    module: setting
    resource: location
    action: view
    entry: true
  - id: location.create
    module: setting
    resource: location
    action: create
    requires: [location.view]
`;
    const { definitions, map, graph } = loader.loadFromYamlContent(validYaml);

    expect(definitions.length).toBe(2);
    expect(map.size).toBe(2);
    expect(loader.getById('location.view')).toBeDefined();
    expect(loader.getById('location.view')?.entry).toBe(true);
    expect(loader.getById('location.create')?.requires).toEqual(['location.view']);

    const createNode = graph.nodes.get('location.create');
    expect(createNode?.prerequisites.has('location.view')).toBe(true);
    const viewNode = graph.nodes.get('location.view');
    expect(viewNode?.dependents.has('location.create')).toBe(true);
  });

  it('should throw InvalidPermissionFormatError if action uses past-tense verb', () => {
    const invalidEventYaml = `
permissions:
  - id: location.created
    module: setting
    resource: location
    action: created
`;
    expect(() => loader.loadFromYamlContent(invalidEventYaml)).toThrow(
      InvalidPermissionFormatError,
    );
  });

  it('should throw InvalidPermissionFormatError if ID does not match resource.action concatenation', () => {
    const mismatchedYaml = `
permissions:
  - id: custom.view
    module: setting
    resource: location
    action: view
`;
    expect(() => loader.loadFromYamlContent(mismatchedYaml)).toThrow(InvalidPermissionFormatError);
  });

  it('should successfully load default catalog from file', () => {
    const { definitions, map, graph } = loader.loadFromFile();
    expect(definitions.length).toBeGreaterThan(0);
    expect(map.size).toBeGreaterThan(0);
    expect(graph.nodes.size).toBeGreaterThan(0);
  });

  it('should throw error when target file does not exist', () => {
    expect(() => loader.loadFromFile('/non/existent/path.yaml')).toThrow(
      /Permission catalog YAML file not found/,
    );
  });
});
