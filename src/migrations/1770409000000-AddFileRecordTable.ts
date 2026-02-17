import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileRecordTable1770409000000 implements MigrationInterface {
  name = 'AddFileRecordTable1770409000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'files_status_enum') THEN
          CREATE TYPE "files_status_enum" AS ENUM ('pending', 'ready');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'files_visibility_enum') THEN
          CREATE TYPE "files_visibility_enum" AS ENUM ('private', 'public');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL,
        "entity_id" uuid NULL,
        "key" character varying(512) NOT NULL,
        "content_type" character varying(120) NOT NULL,
        "size" integer NOT NULL,
        "status" "files_status_enum" NOT NULL DEFAULT 'pending',
        "visibility" "files_visibility_enum" NOT NULL DEFAULT 'private',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_files_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_files_key" UNIQUE ("key"),
        CONSTRAINT "FK_files_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_files_owner_id" ON "files" ("owner_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_files_entity_id" ON "files" ("entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_files_status" ON "files" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_files_visibility" ON "files" ("visibility")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "files"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "files_visibility_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "files_status_enum"`);
  }
}
