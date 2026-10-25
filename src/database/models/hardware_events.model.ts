import { Pool } from 'pg';

export async function createHardwareEvents(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hardware_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_name TEXT NOT NULL DEFAULT 'Biometric device',
      event TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Success',
      details TEXT,
      ip_address INET,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hardware_events_occurred
    ON hardware_events (occurred_at DESC);
  `);
}
