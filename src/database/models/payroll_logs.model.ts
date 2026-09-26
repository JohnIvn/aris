import { Pool } from 'pg';

export async function createPayrollLogs(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS payroll_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_type payroll_action,
      action_status action_status,
      professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
      user_id UUID,
      employee_id TEXT,
      salary INT DEFAULT 0,
      date_received DATE DEFAULT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payroll_logs_professor_id
    ON payroll_logs (professor_id);
  `);
}
