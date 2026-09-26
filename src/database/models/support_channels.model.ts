import { Pool } from 'pg';

export async function createSupportChannels(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS support_channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label TEXT NOT NULL,
      detail TEXT NOT NULL,
      kind support_channel_kind DEFAULT 'email',
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
}
