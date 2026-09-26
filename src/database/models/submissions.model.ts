import { Pool } from 'pg';

export async function createSubmissions(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES accomplishment_reports(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      role user_role DEFAULT 'staff',
      reference TEXT UNIQUE,
      record_type TEXT,
      status report_status DEFAULT 'submitted',
      topics TEXT,
      notes TEXT,
      due_at TIMESTAMP,
      submitted_at TIMESTAMP DEFAULT NOW(),
      reviewed_by UUID,
      reviewed_at TIMESTAMP,
      remark TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_report_id
    ON submissions (report_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_user_id
    ON submissions (user_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_status
    ON submissions (status, submitted_at DESC);
  `);
}
