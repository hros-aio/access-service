import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBaseEntityMetadata1716710400000 implements MigrationInterface {
  name = 'AlignBaseEntityMetadata1716710400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Update users table
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`);

    // 2. Update external_identities table
    await queryRunner.query(
      `ALTER TABLE "external_identities" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_identities" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_identities" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_identities" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`,
    );

    // 3. Update authentication_settings table
    await queryRunner.query(
      `ALTER TABLE "authentication_settings" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "authentication_settings" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "authentication_settings" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
    );

    // 4. Update auth_security_events_outbox table
    await queryRunner.query(
      `ALTER TABLE "auth_security_events_outbox" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_security_events_outbox" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_security_events_outbox" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 4. Revert auth_security_events_outbox table
    await queryRunner.query(`ALTER TABLE "auth_security_events_outbox" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "auth_security_events_outbox" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "auth_security_events_outbox" DROP COLUMN "updated_at"`);

    // 3. Revert authentication_settings table
    await queryRunner.query(`ALTER TABLE "authentication_settings" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "authentication_settings" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "authentication_settings" DROP COLUMN "created_at"`);

    // 2. Revert external_identities table
    await queryRunner.query(`ALTER TABLE "external_identities" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "external_identities" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "external_identities" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "external_identities" DROP COLUMN "created_at"`);

    // 1. Revert users table
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
