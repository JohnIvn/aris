import { Pool } from 'pg';

export async function createUserStaffs(client: Pool) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS user_staffs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      firstname TEXT NOT NULL,
      middlename TEXT DEFAULT NULL,
      lastname TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      avatar_url TEXT DEFAULT NULL,
      birthday DATE DEFAULT NULL,
      age INT DEFAULT NULL,
      gender TEXT DEFAULT NULL,
      position TEXT DEFAULT NULL REFERENCES staff_roles(name) ON UPDATE CASCADE ON DELETE SET NULL,
      department TEXT DEFAULT NULL,
      provider account_provider DEFAULT 'local',
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      failed_login_attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_staffs_position'
      ) THEN
        ALTER TABLE user_staffs
        ADD CONSTRAINT fk_user_staffs_position
        FOREIGN KEY (position)
        REFERENCES staff_roles(name)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);
}
