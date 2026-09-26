import { Pool } from 'pg';

export async function createSubmissionApprovals(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS submission_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      stage_id UUID NOT NULL REFERENCES approval_stages(id) ON DELETE RESTRICT,
      status approval_status DEFAULT 'pending',
      assigned_to UUID,
      routed_at TIMESTAMP DEFAULT NOW(),
      decided_at TIMESTAMP,
      remark TEXT,
      event_summary TEXT,
      UNIQUE (submission_id, stage_id)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_approvals_submission
    ON submission_approvals (submission_id);

    CREATE INDEX IF NOT EXISTS idx_submission_approvals_pending
    ON submission_approvals (status, stage_id, routed_at);
  `);
}
