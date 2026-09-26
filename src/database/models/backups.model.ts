import { Pool } from 'pg';

export async function createBackups(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      backup_type backup_type,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum TEXT,
      status backup_status DEFAULT 'verified',
      storage_location TEXT,
      is_encrypted BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_backups_created
    ON backups (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_backups_status
    ON backups (status);
  `);
}
