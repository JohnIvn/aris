import { Pool } from 'pg';

export default async function createReports(client: Pool) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS accomplishment_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        employee_id TEXT UNIQUE NOT NULL,
        shift_hours INT NOT NULL,
        shift_start DATE,
        shift_end DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
}
