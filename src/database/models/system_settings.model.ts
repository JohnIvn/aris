import { Pool } from 'pg';

export async function createSystemSettings(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      data_type TEXT NOT NULL DEFAULT 'string',
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT,
      updated_by UUID,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_system_settings_category
    ON system_settings (category);
  `);
}
