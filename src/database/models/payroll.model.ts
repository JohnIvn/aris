import { Pool } from 'pg';

export default async function createPayroll(client: Pool) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS payroll (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        employee_id TEXT REFERENCES accomplishment_reports(employee_id) ON DELETE SET NULL ON UPDATE,
        salary INT DEFAULT 0,
        date_received DATE DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    `,
  );
}
