import { Pool } from 'pg';

export async function createSubmissions(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID,
      user_id UUID,
      role user_role DEFAULT 'staff',
      reference TEXT UNIQUE,
      record_type TEXT,
      period TEXT,
      units TEXT,
      status TEXT DEFAULT 'Pending',
      event TEXT,
      payload JSONB,
      topics TEXT,
      notes TEXT,
      due_at TIMESTAMP,
      submitted_at TIMESTAMP DEFAULT NOW(),
      reviewed_by UUID,
      reviewed_at TIMESTAMP,
      remark TEXT,
      user_email TEXT,
      professor_id UUID,
      stage TEXT DEFAULT 'Checker',
      current_stage TEXT DEFAULT 'Checker',
      current_since TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Ensure optional columns exist if table was already created
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE submissions ALTER COLUMN report_id DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      BEGIN
        ALTER TABLE submissions ALTER COLUMN user_id DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END $$;

    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS period TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS units TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS event TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS payload JSONB;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_email TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS professor_id UUID;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Checker';
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'Checker';
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_since TIMESTAMP DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_submissions_reference
    ON submissions (reference);

    CREATE INDEX IF NOT EXISTS idx_submissions_user_email
    ON submissions (user_email);

    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
    ON submissions (submitted_at DESC);
  `);
}
