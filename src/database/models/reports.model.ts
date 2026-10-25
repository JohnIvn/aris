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
        entries UUID[],
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
}
