import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxRetryColumns1720000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_security_events_outbox"
      ADD COLUMN IF NOT EXISTS "attempt_count" INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_attempted_at" TIMESTAMPTZ NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_security_events_outbox"
      DROP COLUMN IF EXISTS "attempt_count",
      DROP COLUMN IF EXISTS "last_attempted_at";
    `);
  }
}
