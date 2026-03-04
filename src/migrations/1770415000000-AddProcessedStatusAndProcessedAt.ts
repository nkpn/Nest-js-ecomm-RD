import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedStatusAndProcessedAt1770415000000
  implements MigrationInterface
{
  name = 'AddProcessedStatusAndProcessedAt1770415000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'PROCESSED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "processed_at"`,
    );
  }
}
