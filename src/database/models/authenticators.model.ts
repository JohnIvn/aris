import { Pool } from 'pg';

export default async function createAuthenticatorModel(client: Pool) {
  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS authenticator_tag_seq START 1;

    CREATE TABLE IF NOT EXISTS authenticators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tag TEXT UNIQUE DEFAULT CONCAT('auth', NEXTVAL('authenticator_tag_seq')),
      is_registered BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
