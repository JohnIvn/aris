import { Pool } from 'pg';

export default async function createDtrSubmissionsModel(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dtr_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id UUID NOT NULL REFERENCES user_professors(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      approval_stage VARCHAR NOT NULL DEFAULT 'AR-AP-STG-1',
      status VARCHAR NOT NULL DEFAULT 'pending',
      remarks TEXT,
      attachment_name VARCHAR,
      submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (professor_id, period_start, period_end)
    );

    CREATE TABLE IF NOT EXISTS dtr_submission_entries (
      submission_id UUID NOT NULL REFERENCES dtr_submissions(id) ON DELETE CASCADE,
      dtr_id UUID NOT NULL REFERENCES dtr(id) ON DELETE CASCADE,
      PRIMARY KEY (submission_id, dtr_id)
    );
  `);
}
