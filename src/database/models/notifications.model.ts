import { Pool } from 'pg';

export async function createNotifications(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      type notification_type,
      title TEXT,
      body TEXT,
      entity_type TEXT,
      entity_id UUID,
      actor_id UUID DEFAULT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read
    ON notifications (user_id, is_read);
  `);
}
