import { Pool } from 'pg';

export async function createSessions(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role user_role NOT NULL,
      staff_id UUID REFERENCES user_staffs(id) ON DELETE CASCADE,
      professor_id UUID REFERENCES user_professors(id) ON DELETE CASCADE,
      admin_id UUID REFERENCES user_admins(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT sessions_subject_matches_role CHECK (
        (role = 'staff' AND staff_id IS NOT NULL AND professor_id IS NULL AND admin_id IS NULL)
        OR (role = 'professor' AND professor_id IS NOT NULL AND staff_id IS NULL AND admin_id IS NULL)
        OR (role = 'admin' AND admin_id IS NOT NULL AND staff_id IS NULL AND professor_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_role
    ON sessions (role);

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_staff_id
    ON sessions (staff_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_professor_id
    ON sessions (professor_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_admin_id
    ON sessions (admin_id);
  `);
}
