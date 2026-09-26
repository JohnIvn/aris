import { Pool } from 'pg';

export async function createLoginAttempts(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      user_id UUID,
      role user_role,
      staff_id UUID REFERENCES user_staffs(id) ON DELETE SET NULL,
      professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
      admin_id UUID REFERENCES user_admins(id) ON DELETE SET NULL,
      ip_address TEXT,
      user_agent TEXT,
      succeeded BOOLEAN NOT NULL DEFAULT FALSE,
      failure_reason TEXT,
      attempted_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT login_attempts_subject_matches_role CHECK (
        (role = 'staff' AND staff_id IS NOT NULL AND professor_id IS NULL AND admin_id IS NULL)
        OR (role = 'professor' AND professor_id IS NOT NULL AND staff_id IS NULL AND admin_id IS NULL)
        OR (role = 'admin' AND admin_id IS NOT NULL AND staff_id IS NULL AND professor_id IS NULL)
        OR (staff_id IS NULL AND professor_id IS NULL AND admin_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_email
    ON login_attempts (email, attempted_at DESC);

    CREATE INDEX IF NOT EXISTS idx_login_attempts_staff_id
    ON login_attempts (staff_id);

    CREATE INDEX IF NOT EXISTS idx_login_attempts_professor_id
    ON login_attempts (professor_id);

    CREATE INDEX IF NOT EXISTS idx_login_attempts_admin_id
    ON login_attempts (admin_id);
  `);
}
