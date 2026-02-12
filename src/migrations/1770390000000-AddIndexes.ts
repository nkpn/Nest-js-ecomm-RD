import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexes1770390000000 implements MigrationInterface {
  name = 'AddIndexes1770390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_idempotency_key_unique" ON "orders" ("idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_orders_status_created_at" ON "orders" ("status", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_orders_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_orders_idempotency_key_unique"`,
    );
  }
}
