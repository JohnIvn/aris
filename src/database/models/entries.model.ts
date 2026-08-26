import { Pool } from 'pg';

export default async function createReportEntries(client: Pool) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS report_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id UUID NOT NULL REFERENCES accomplishment_reports(id) ON DELETE CASCADE,
        course TEXT,
        description TEXT,
        output_count INT DEFAULT 0,
        status report_status DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
}
