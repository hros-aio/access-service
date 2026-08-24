import { Module, OnModuleInit } from '@nestjs/common';

import { PermissionsController } from './controllers/permissions.controller';
import { PermissionCatalogLoader } from './loaders/permission-catalog.loader';
import { PermissionCatalogValidator } from './services/permission-catalog-validator.service';
import { PermissionCatalogService } from './services/permission-catalog.service';
import { PermissionDependencyService } from './services/permission-dependency.service';

@Module({
  controllers: [PermissionsController],
  providers: [
    PermissionCatalogLoader,
    PermissionCatalogValidator,
    PermissionCatalogService,
    PermissionDependencyService,
  ],
  exports: [
    PermissionCatalogLoader,
    PermissionCatalogValidator,
    PermissionCatalogService,
    PermissionDependencyService,
  ],
})
export class PermissionsModule implements OnModuleInit {
  constructor(private readonly catalogService: PermissionCatalogService) {}

  public onModuleInit(): void {
    // Initialized and validated during application bootstrap
    this.catalogService.initialize();
  }
}
