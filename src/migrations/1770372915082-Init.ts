import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1770372915082 implements MigrationInterface {
  name = 'Init1770372915082';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email_unique" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL, "price_snapshot" numeric(12,2) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_product_id" ON "order_items" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('CREATED', 'PAID', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'CREATED', "idempotency_key" character varying(120), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_created_at" ON "orders" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user_id" ON "orders" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "sku" character varying(64) NOT NULL, "description" text, "price" numeric(12,2) NOT NULL, "stock" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_created_at" ON "products" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_products_sku_unique" ON "products" ("sku") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_products_sku_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_products_created_at"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_created_at"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_order_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_product_id"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email_unique"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
