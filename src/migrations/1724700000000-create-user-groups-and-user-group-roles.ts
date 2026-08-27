import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserGroupsAndUserGroupRoles1724700000000 implements MigrationInterface {
  name = 'CreateUserGroupsAndUserGroupRoles1724700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_groups" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(150) NOT NULL,
        "description" TEXT,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "scope_type" VARCHAR(50) NOT NULL,
        "scope_ref_id" VARCHAR(100),
        "matching_rule" JSONB NOT NULL,
        "rule_attribute_keys" TEXT[] NOT NULL DEFAULT '{}',
        "version" INTEGER NOT NULL DEFAULT 1,
        "projection_version" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        "created_by" UUID,
        "updated_by" UUID,
        CONSTRAINT "fk_user_groups_tenant" FOREIGN KEY ("tenant_code") REFERENCES "tenants" ("tenant_code") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "uq_user_groups_tenant_name" UNIQUE ("tenant_code", "name"),
        CONSTRAINT "uq_user_groups_tenant_id" UNIQUE ("tenant_code", "id"),
        CONSTRAINT "chk_user_groups_status" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT "chk_user_groups_scope_type" CHECK ("scope_type" IN ('SELF', 'DIRECT_REPORTEES', 'COMPANY', 'LOCATION', 'DEPARTMENT', 'TENANT_WIDE')),
        CONSTRAINT "chk_user_groups_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_user_groups_projection_version" CHECK ("projection_version" >= 0)
      );

      CREATE INDEX IF NOT EXISTS "idx_user_groups_tenant_status"
        ON "user_groups" ("tenant_code", "status");

      CREATE INDEX IF NOT EXISTS "idx_user_groups_rule_attribute_keys"
        ON "user_groups" USING GIN ("rule_attribute_keys");

      CREATE TABLE IF NOT EXISTS "user_group_roles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "user_group_id" UUID NOT NULL,
        "role_id" UUID NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "fk_user_group_roles_user_group" FOREIGN KEY ("user_group_id") REFERENCES "user_groups" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "fk_user_group_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "uq_user_group_roles_tenant_group_role" UNIQUE ("tenant_code", "user_group_id", "role_id")
      );

      CREATE INDEX IF NOT EXISTS "idx_user_group_roles_user_group_id"
        ON "user_group_roles" ("user_group_id");

      CREATE INDEX IF NOT EXISTS "idx_user_group_roles_role_id"
        ON "user_group_roles" ("role_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_group_roles" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_groups" CASCADE;`);
  }
}
