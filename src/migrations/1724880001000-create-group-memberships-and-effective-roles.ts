import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroupMembershipsAndEffectiveRoles1724880001000 implements MigrationInterface {
  name = 'CreateGroupMembershipsAndEffectiveRoles1724880001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_group_memberships" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "group_id" UUID NOT NULL,
        "employee_id" UUID NOT NULL,
        "matched_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_user_group_memberships_tenant" FOREIGN KEY ("tenant_code") REFERENCES "tenants" ("tenant_code") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "fk_user_group_memberships_group" FOREIGN KEY ("group_id") REFERENCES "user_groups" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "fk_user_group_memberships_employee" FOREIGN KEY ("employee_id") REFERENCES "employee_references" ("employee_id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "uq_user_group_memberships_tenant_group_employee" UNIQUE ("tenant_code", "group_id", "employee_id")
      );

      CREATE INDEX IF NOT EXISTS "idx_user_group_memberships_tenant_employee"
        ON "user_group_memberships" ("tenant_code", "employee_id");

      CREATE INDEX IF NOT EXISTS "idx_user_group_memberships_tenant_group"
        ON "user_group_memberships" ("tenant_code", "group_id");

      CREATE TABLE IF NOT EXISTS "user_effective_roles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(50) NOT NULL,
        "employee_id" UUID NOT NULL,
        "role_id" UUID NOT NULL,
        "source_group_id" UUID NOT NULL,
        "scope_type" VARCHAR(50) NOT NULL,
        "scope_entity_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_user_effective_roles_tenant" FOREIGN KEY ("tenant_code") REFERENCES "tenants" ("tenant_code") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "fk_user_effective_roles_employee" FOREIGN KEY ("employee_id") REFERENCES "employee_references" ("employee_id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "fk_user_effective_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "fk_user_effective_roles_source_group" FOREIGN KEY ("source_group_id") REFERENCES "user_groups" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "uq_user_effective_roles_grant" UNIQUE ("tenant_code", "employee_id", "role_id", "source_group_id", "scope_type", "scope_entity_id")
      );

      CREATE INDEX IF NOT EXISTS "idx_user_effective_roles_employee"
        ON "user_effective_roles" ("tenant_code", "employee_id");

      CREATE INDEX IF NOT EXISTS "idx_user_effective_roles_group"
        ON "user_effective_roles" ("tenant_code", "source_group_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_effective_roles" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_group_memberships" CASCADE;`);
  }
}
