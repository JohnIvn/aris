import { Pool } from 'pg';

export default async function createReports(client: Pool) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS accomplishment_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        employee_id TEXT NOT NULL,
        faculty_no TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        approval_stage TEXT NOT NULL REFERENCES approval_stages(stage_key) ON DELETE CASCADE ON UPDATE CASCADE,
        remarks TEXT DEFAULT NULL,
        submission_status TEXT NOT NULL DEFAULT 'pending',
        submission_reference TEXT,
        submission_event TEXT,
        submission_units TEXT,
        submission_topics TEXT,
        submission_notes TEXT,
        submission_payload JSONB,
        submitted_at TIMESTAMP DEFAULT NOW(),
        reviewed_by UUID,
        reviewed_at TIMESTAMP,
        current_stage TEXT DEFAULT 'Checker',
        current_since TIMESTAMP DEFAULT NOW(),
        payroll_availability BOOLEAN DEFAULT FALSE,
        payroll_received BOOLEAN DEFAULT FALSE,
        payroll_received_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
  await client.query(`
    ALTER TABLE accomplishment_reports
      ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS submission_reference TEXT,
      ADD COLUMN IF NOT EXISTS submission_event TEXT,
      ADD COLUMN IF NOT EXISTS submission_units TEXT,
      ADD COLUMN IF NOT EXISTS submission_topics TEXT,
      ADD COLUMN IF NOT EXISTS submission_notes TEXT,
      ADD COLUMN IF NOT EXISTS submission_payload JSONB,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS reviewed_by UUID,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'Checker',
      ADD COLUMN IF NOT EXISTS current_since TIMESTAMP DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accomplishment_reports_submission_reference
      ON accomplishment_reports (submission_reference)
      WHERE submission_reference IS NOT NULL;
  `);
}
