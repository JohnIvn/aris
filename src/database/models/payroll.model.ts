import { Pool } from 'pg';

export async function createPayrollModel(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS payroll (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
      employee_id TEXT,
      report_id UUID,
      submission_id UUID,
      type TEXT DEFAULT 'AR',
      period TEXT,
      units TEXT,
      hours NUMERIC DEFAULT 0,
      rate NUMERIC DEFAULT 0,
      salary NUMERIC DEFAULT 0,
      amount NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'Approved',
      date_received DATE DEFAULT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payroll_user_id ON payroll (user_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_professor_id ON payroll (professor_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_employee_id ON payroll (employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_report_id ON payroll (report_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_submission_id ON payroll (submission_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll (status);
  `);
}

