import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendEmployeeReferencesProjection1724880000000 implements MigrationInterface {
  name = 'ExtendEmployeeReferencesProjection1724880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_references"
        ADD COLUMN IF NOT EXISTS "company_id" UUID,
        ADD COLUMN IF NOT EXISTS "location_id" UUID,
        ADD COLUMN IF NOT EXISTS "department_id" UUID,
        ADD COLUMN IF NOT EXISTS "grade_id" UUID,
        ADD COLUMN IF NOT EXISTS "job_title_id" UUID,
        ADD COLUMN IF NOT EXISTS "employment_status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS "manager_employee_id" UUID,
        ADD COLUMN IF NOT EXISTS "reportees_count" INT NOT NULL DEFAULT 0;

      -- Convert source_version to BIGINT or ensure it is BIGINT
      ALTER TABLE "employee_references"
        ALTER COLUMN "source_version" TYPE BIGINT USING COALESCE(NULLIF(regexp_replace(source_version, '[^0-9]', '', 'g'), '')::BIGINT, 0);

      ALTER TABLE "employee_references"
        ALTER COLUMN "source_version" SET DEFAULT 0,
        ALTER COLUMN "source_version" SET NOT NULL;

      CREATE INDEX IF NOT EXISTS "idx_employee_references_matching_attrs"
        ON "employee_references" ("tenant_code", "department_id", "location_id", "company_id", "employment_status");

      CREATE INDEX IF NOT EXISTS "idx_employee_references_manager"
        ON "employee_references" ("tenant_code", "manager_employee_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_employee_references_manager";
      DROP INDEX IF EXISTS "idx_employee_references_matching_attrs";
      ALTER TABLE "employee_references"
        DROP COLUMN IF EXISTS "reportees_count",
        DROP COLUMN IF EXISTS "manager_employee_id",
        DROP COLUMN IF EXISTS "employment_status",
        DROP COLUMN IF EXISTS "job_title_id",
        DROP COLUMN IF EXISTS "grade_id",
        DROP COLUMN IF EXISTS "department_id",
        DROP COLUMN IF EXISTS "location_id",
        DROP COLUMN IF EXISTS "company_id";
    `);
  }
}
