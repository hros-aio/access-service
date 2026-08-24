import { PermissionCatalogValidator } from './permission-catalog-validator.service';
import { PermissionCatalogService } from './permission-catalog.service';
import { PermissionCatalogLoader } from '../loaders/permission-catalog.loader';

describe('PermissionCatalogService', () => {
  let service: PermissionCatalogService;
  let loader: PermissionCatalogLoader;
  let validator: PermissionCatalogValidator;

  beforeEach(() => {
    loader = new PermissionCatalogLoader();
    validator = new PermissionCatalogValidator();
    service = new PermissionCatalogService(loader, validator);
  });

  it('should initialize and aggregate catalog by module and resource', () => {
    const yamlContent = `
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
  - id: employee.view
    module: directory
    resource: employee
    action: view
    entry: true
`;
    loader.loadFromYamlContent(yamlContent);
    service['definitions'] = loader.getAll();
    service['graph'] = loader.getGraph();

    const hierarchy = service.getCatalogHierarchy();
    expect(hierarchy.totalModules).toBe(2);
    expect(hierarchy.totalPermissions).toBe(3);

    const settingModule = hierarchy.modules.find((m) => m.module === 'setting');
    expect(settingModule).toBeDefined();
    expect(settingModule?.resources.length).toBe(1);
    expect(settingModule?.resources[0].resource).toBe('location');
    expect(settingModule?.resources[0].permissions.length).toBe(2);

    const deps = service.getDependencyMatrix();
    expect(deps.dependencies.length).toBe(3);
    const locationViewDep = deps.dependencies.find((d) => d.permissionCode === 'location.view');
    expect(locationViewDep?.requiredBy).toContain('location.create');
  });
});
