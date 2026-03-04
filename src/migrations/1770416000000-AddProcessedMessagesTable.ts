import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedMessagesTable1770416000000
  implements MigrationInterface
{
  name = 'AddProcessedMessagesTable1770416000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_messages" ("message_id" uuid NOT NULL, "order_id" uuid NOT NULL, "handler" character varying(120), "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_messages_message_id" PRIMARY KEY ("message_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_processed_messages_processed_at" ON "processed_messages" ("processed_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "processed_messages" ADD CONSTRAINT "FK_processed_messages_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "processed_messages" DROP CONSTRAINT "FK_processed_messages_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_processed_messages_processed_at"`,
    );
    await queryRunner.query(`DROP TABLE "processed_messages"`);
  }
}
