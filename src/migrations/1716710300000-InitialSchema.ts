import * as fs from 'fs';
import * as path from 'path';

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1716710300000 implements MigrationInterface {
  name = 'InitialSchema1716710300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    let schemaSql = fs.readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8');

    // Remove transaction control statements if present to avoid nested transaction issues in TypeORM
    schemaSql = schemaSql.replace(/^\s*BEGIN\s*;?/im, '');
    schemaSql = schemaSql.replace(/\s*COMMIT\s*;?\s*$/im, '');

    await queryRunner.query(schemaSql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "auth_security_events_outbox" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "authentication_settings" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "mfa_methods" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "invitations" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "external_identities" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "credentials" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "users" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "employee_references" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "tenants" CASCADE;');
  }
}
