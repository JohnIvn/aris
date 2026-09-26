import { Pool } from 'pg';

export async function createSubmissionStatusHistory(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS submission_status_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      from_status submission_status,
      to_status submission_status NOT NULL,
      stage_id UUID REFERENCES approval_stages(id) ON DELETE SET NULL,
      changed_by UUID,
      changed_by_label TEXT,
      note TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_submission_status_history_submission
    ON submission_status_history (submission_id, changed_at DESC);
  `);
}
