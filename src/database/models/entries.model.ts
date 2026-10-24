import { Pool } from 'pg';

export default async function createReportEntries(client: Pool) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS report_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id UUID NOT NULL REFERENCES accomplishment_reports(id) ON DELETE CASCADE,
        course TEXT NOT NULL,
        code TEXT NOT NULL,
        program TEXT NOT NULL,
        year INT NOT NULL, 
        section TEXT NOT NULL,
        units INT NOT NULL,
        day TEXT NOT NULL,
        shift_hours NUMERIC(10, 2) NOT NULL,
        shift_start DATE NOT NULL,
        shift_end DATE NOT NULL,
        campus TEXT NOT NULL,
        class_date DATE NOT NULL,
        topics TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
}
