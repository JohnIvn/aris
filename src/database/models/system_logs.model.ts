import { Pool } from 'pg';

export async function createSystemLogs(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id UUID,
      actor_label TEXT NOT NULL,
      kind log_kind NOT NULL,
      event TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      user_agent TEXT,
      session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      occurred_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_system_logs_occurred
    ON system_logs (occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_system_logs_kind
    ON system_logs (kind, occurred_at DESC);
  `);
}
