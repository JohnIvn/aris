import { Pool } from 'pg';

export async function createMeetingRecords(client: Pool) {
  try {
    await client.query(`ALTER TYPE meeting_status ADD VALUE IF NOT EXISTS 'completed';`);
  } catch {
    // Enum value may already exist or cannot run in current context
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS meeting_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      info TEXT,
      meeting_date DATE,
      start_time TIME,
      end_time TIME,
      duration_minutes INT,
      status meeting_status DEFAULT 'scheduled',
      word_count INT,
      overview TEXT,
      file_path TEXT,
      file_name TEXT,
      file_size_bytes BIGINT DEFAULT 0,
      transcript_source TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_meeting_records_professor_id
    ON meeting_records (professor_id);

    CREATE INDEX IF NOT EXISTS idx_meeting_records_meeting_date
    ON meeting_records (meeting_date DESC);

    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS meeting_code TEXT;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS meeting_url TEXT;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS course TEXT;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS decisions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS transcript JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]'::jsonb;
  `);
}
