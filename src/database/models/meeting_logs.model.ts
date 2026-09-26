import { Pool } from 'pg';

export async function createMeetingLogs(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS meeting_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_type meeting_action,
      action_status action_status,
      professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
      meeting_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
      user_id UUID,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_meeting_logs_professor_id
    ON meeting_logs (professor_id);

    CREATE INDEX IF NOT EXISTS idx_meeting_logs_meeting_id
    ON meeting_logs (meeting_id);
  `);
}
