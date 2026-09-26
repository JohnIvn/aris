import { Pool } from 'pg';

export async function createSubmissionAttachments(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS submission_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      mime_type TEXT,
      storage_path TEXT,
      uploaded_by UUID,
      uploaded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_submission_attachments_submission
    ON submission_attachments (submission_id);
  `);
}
