import { Pool } from 'pg';

export async function createUsers(client: Pool) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      avatar_url TEXT,
      username TEXT,
      firstname TEXT NOT NULL,
      middlename TEXT DEFAULT NULL,
      lastname TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      birthday DATE DEFAULT NULL,
      age INT DEFAULT NULL,
      gender TEXT DEFAULT NULL,
      provider TEXT,
      role member_role DEFAULT 'employee',
      failed_login_attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
