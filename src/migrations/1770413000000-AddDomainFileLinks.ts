import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDomainFileLinks1770413000000 implements MigrationInterface {
  name = 'AddDomainFileLinks1770413000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_file_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_file_id" uuid`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_avatar_file_id" ON "users" ("avatar_file_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_image_file_id" ON "products" ("image_file_id")`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_users_avatar_file'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "FK_users_avatar_file"
          FOREIGN KEY ("avatar_file_id")
          REFERENCES "files"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_products_image_file'
        ) THEN
          ALTER TABLE "products"
          ADD CONSTRAINT "FK_products_image_file"
          FOREIGN KEY ("image_file_id")
          REFERENCES "files"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_image_file"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_avatar_file"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_products_image_file_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_avatar_file_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "image_file_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_file_id"`,
    );
  }
}

