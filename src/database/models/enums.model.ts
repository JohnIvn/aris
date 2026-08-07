import { Pool } from 'pg';

export async function createEnumTypes(client: Pool) {
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE member_role AS ENUM ('employee', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
