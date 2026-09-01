import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPriorityToAuthorizationSyncJobs1756720000000 implements MigrationInterface {
  name = 'AddPriorityToAuthorizationSyncJobs1756720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE authorization_sync_priority_enum AS ENUM ('URGENT', 'STANDARD');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "authorization_sync_jobs" 
      ADD COLUMN IF NOT EXISTS "priority" "authorization_sync_priority_enum" NOT NULL DEFAULT 'STANDARD';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_authz_sync_jobs_priority_claim" 
      ON "authorization_sync_jobs" ("tenant_code", "status", "priority" DESC, "created_at" ASC) 
      WHERE "status" = 'PENDING';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_authz_sync_jobs_priority_claim";
    `);

    await queryRunner.query(`
      ALTER TABLE "authorization_sync_jobs" DROP COLUMN IF EXISTS "priority";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "authorization_sync_priority_enum";
    `);
  }
}
