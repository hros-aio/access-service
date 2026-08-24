import { PermissionCatalogValidator } from './permission-catalog-validator.service';
import { PermissionCatalogService } from './permission-catalog.service';
import { PermissionDependencyService } from './permission-dependency.service';
import { PermissionCatalogLoader } from '../loaders/permission-catalog.loader';

describe('PermissionDependencyService', () => {
  let dependencyService: PermissionDependencyService;
  let catalogService: PermissionCatalogService;
  let loader: PermissionCatalogLoader;
  let validator: PermissionCatalogValidator;

  beforeEach(() => {
    loader = new PermissionCatalogLoader();
    validator = new PermissionCatalogValidator();
    catalogService = new PermissionCatalogService(loader, validator);

    const testYaml = `
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

  - id: location.update
    module: setting
    resource: location
    action: update
    requires: [location.view]

  - id: location.deactivate
    module: setting
    resource: location
    action: deactivate
    requires: [location.view]

  - id: location.delete
    module: setting
    resource: location
    action: delete
    requires: [location.view, location.deactivate]

  - id: legacy.view
    module: setting
    resource: legacy
    action: view
    deprecated: true
`;
    loader.loadFromYamlContent(testYaml);
    catalogService['definitions'] = loader.getAll();
    catalogService['graph'] = loader.getGraph();

    dependencyService = new PermissionDependencyService(catalogService);
  });

  describe('US2: Action capability prerequisite validation', () => {
    it('should fail when granting an action capability without its prerequisite view capability', () => {
      const result = dependencyService.validatePermissionSet(['location.create']);
      expect(result.isValid).toBe(false);
      const missingPrereq = result.errors.find((e) => e.type === 'MISSING_PREREQUISITE');
      expect(missingPrereq).toBeDefined();
      expect(missingPrereq?.code).toBe('location.create');
      expect(missingPrereq?.conflictCodes).toContain('location.view');
    });

    it('should succeed when granting an action capability alongside its prerequisite view capability', () => {
      const result = dependencyService.validatePermissionSet(['location.view', 'location.create']);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should enforce multi-hop / multi-prerequisite chains', () => {
      // location.delete requires location.view AND location.deactivate
      const result = dependencyService.validatePermissionSet(['location.view', 'location.delete']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'location.delete')).toBe(true);
    });
  });

  describe('US3: Prerequisite capability revocation blocking', () => {
    it('should detect missing prerequisite when dependent action is present without prerequisite capability', () => {
      // Scenario: evaluating set containing location.update without location.view
      const result = dependencyService.validatePermissionSet(['location.update']);
      expect(result.isValid).toBe(false);
      const missingPrereq = result.errors.find((e) => e.type === 'MISSING_PREREQUISITE');
      expect(missingPrereq).toBeDefined();
      expect(missingPrereq?.code).toBe('location.update');
      expect(missingPrereq?.conflictCodes).toContain('location.view');
    });
  });

  describe('Validation edge cases: Unknown and Deprecated codes', () => {
    it('should reject unknown permission codes with UNKNOWN_CODE violation', () => {
      const result = dependencyService.validatePermissionSet(['unknown.action']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.type === 'UNKNOWN_CODE')).toBe(true);
    });

    it('should reject deprecated permission codes with DEPRECATED_CODE violation', () => {
      const result = dependencyService.validatePermissionSet(['legacy.view']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.type === 'DEPRECATED_CODE')).toBe(true);
    });
  });
});
