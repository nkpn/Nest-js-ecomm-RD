import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingOrderStatus1770414000000 implements MigrationInterface {
  name = 'AddPendingOrderStatus1770414000000';
  // PostgreSQL requires enum value commit before it can be referenced in defaults.
  // Run this migration outside a transaction so ALTER TYPE and ALTER TABLE are safe.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'CREATED'`,
    );
  }
}
