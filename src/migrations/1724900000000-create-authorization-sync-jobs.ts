import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthorizationSyncJobs1724900000000 implements MigrationInterface {
  name = 'CreateAuthorizationSyncJobs1724900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "authorization_sync_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_code" VARCHAR(64) NOT NULL,
        "source_type" VARCHAR(32) NOT NULL,
        "source_id" UUID NOT NULL,
        "source_version" INT NOT NULL,
        "trigger_type" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
        "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        "total_users" INT,
        "processed_users" INT NOT NULL DEFAULT 0,
        "retry_count" INT NOT NULL DEFAULT 0,
        "error_details" JSONB,
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "created_by" VARCHAR(128),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_authz_sync_jobs_tenant" FOREIGN KEY ("tenant_code") REFERENCES "tenants" ("tenant_code") ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "uq_authz_sync_jobs_in_flight"
        ON "authorization_sync_jobs" ("tenant_code", "source_type", "source_id", "source_version")
        WHERE "status" IN ('PENDING', 'PROCESSING');

      CREATE INDEX IF NOT EXISTS "idx_authz_sync_jobs_poll"
        ON "authorization_sync_jobs" ("status", "created_at")
        WHERE "status" = 'PENDING';

      CREATE INDEX IF NOT EXISTS "idx_authz_sync_jobs_watchdog"
        ON "authorization_sync_jobs" ("status", "updated_at")
        WHERE "status" = 'PROCESSING';

      CREATE INDEX IF NOT EXISTS "idx_authz_sync_jobs_tenant_history"
        ON "authorization_sync_jobs" ("tenant_code", "source_type", "source_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "authorization_sync_jobs" CASCADE;`);
  }
}
