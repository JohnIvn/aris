import { Pool } from 'pg';

export async function createUserNotifications(client: Pool) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS user_professors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES user_professor(id) ON DELETE CASCADE ON UPDATE CASCADE,
      title TEXT DEFAULT NULL,
      description TEXT NOT NULL,
      type notification_type NOT NULL,
      report_id UUID REFERENCES user_professor(id) ON DELETE CASCADE ON UPDATE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
