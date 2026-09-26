import { Pool } from 'pg';

export async function createMeetingRecords(client: Pool) {
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
  `);
}
