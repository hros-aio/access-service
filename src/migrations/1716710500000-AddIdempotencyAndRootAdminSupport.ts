import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyAndRootAdminSupport1716710500000 implements MigrationInterface {
  name = 'AddIdempotencyAndRootAdminSupport1716710500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kafka_consumed_events" (
        "id" UUID PRIMARY KEY,
        "topic" VARCHAR(100) NOT NULL,
        "processed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "kafka_consumed_events"`);
  }
}
