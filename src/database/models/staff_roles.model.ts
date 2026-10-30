import { Pool } from 'pg';

export async function createStaffRoles(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS staff_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      code TEXT UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_roles_name ON staff_roles (name);
  `);

  // Seed default staff roles if table is empty or missing them
  const defaultRoles = [
    [
      'HR',
      'HR',
      'Human Resources staff responsible for employee records and validation',
    ],
    [
      'Checker',
      'CHK',
      'Attendance and document checker for preliminary review',
    ],
    [
      'Secretary',
      'SEC',
      'College or department secretary managing endorsements and schedules',
    ],
    [
      'Accounting',
      'ACC',
      'Accounting and payroll staff handling payroll verification and clearance',
    ],
  ];

  for (const [name, code, desc] of defaultRoles) {
    await client.query(
      `INSERT INTO staff_roles (name, code, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [name, code, desc],
    );
  }
}
