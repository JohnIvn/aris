import { Pool } from 'pg';

export async function createUserNotifications(client: Pool) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS user_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id UUID REFERENCES user_professors(id) ON DELETE CASCADE,
      staff_id UUID REFERENCES user_staffs(id) ON DELETE CASCADE,
      title TEXT DEFAULT NULL,
      description TEXT NOT NULL,
      type notification_type NOT NULL,
      report_id UUID DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT user_notifications_one_recipient
        CHECK ((professor_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1)
    );

    CREATE INDEX IF NOT EXISTS idx_user_notifications_professor
      ON user_notifications (professor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_staff
      ON user_notifications (staff_id, created_at DESC);
  `);
}
