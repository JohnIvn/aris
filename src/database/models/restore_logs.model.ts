import { Pool } from 'pg';

export async function createRestoreLogs(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS restore_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      backup_id UUID NOT NULL REFERENCES backups(id) ON DELETE RESTRICT,
      target_database TEXT NOT NULL,
      initiated_by UUID,
      initiated_by_label TEXT NOT NULL,
      duration_seconds INT,
      status restore_status DEFAULT 'success',
      detail TEXT,
      restored_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_restore_logs_backup_id
    ON restore_logs (backup_id, restored_at DESC);
  `);
}
