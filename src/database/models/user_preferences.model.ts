import { Pool } from 'pg';

export async function createUserPreferences(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id UUID PRIMARY KEY,
      desktop BOOLEAN NOT NULL DEFAULT TRUE,
      weekly BOOLEAN NOT NULL DEFAULT TRUE,
      mentions BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
