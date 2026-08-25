import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesAndRolePermissions1724600000000 implements MigrationInterface {
  name = 'CreateRolesAndRolePermissions1724600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(150) NOT NULL,
        "description" TEXT,
        "role_type" VARCHAR(20) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "system_role_key" VARCHAR(100),
        "version" INTEGER NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        "created_by" UUID,
        "updated_by" UUID,
        CONSTRAINT "fk_roles_tenant" FOREIGN KEY ("tenant_code") REFERENCES "tenants" ("tenant_code") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "uq_roles_tenant_name" UNIQUE ("tenant_code", "name"),
        CONSTRAINT "uq_roles_tenant_id" UNIQUE ("tenant_code", "id"),
        CONSTRAINT "chk_roles_role_type" CHECK ("role_type" IN ('SYSTEM', 'CUSTOM')),
        CONSTRAINT "chk_roles_status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT "chk_roles_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_roles_system_role_key" CHECK (
          ("role_type" = 'SYSTEM' AND "system_role_key" IS NOT NULL) OR
          ("role_type" = 'CUSTOM' AND "system_role_key" IS NULL)
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "uq_roles_tenant_system_role_key"
        ON "roles" ("tenant_code", "system_role_key")
        WHERE "system_role_key" IS NOT NULL;

      CREATE INDEX IF NOT EXISTS "idx_roles_tenant_status"
        ON "roles" ("tenant_code", "status");

      CREATE INDEX IF NOT EXISTS "idx_roles_tenant_type_status"
        ON "roles" ("tenant_code", "role_type", "status");

      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "role_id" UUID NOT NULL,
        "permission_code" VARCHAR(150) NOT NULL,
        "is_protected" BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "uq_role_permissions_role_perm" UNIQUE ("role_id", "permission_code")
      );

      CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_code"
        ON "role_permissions" ("permission_code");

      CREATE INDEX IF NOT EXISTS "idx_role_permissions_tenant_role"
        ON "role_permissions" ("tenant_code", "role_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles" CASCADE;`);
  }
}
