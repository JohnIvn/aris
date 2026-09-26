import { Pool } from 'pg';

export async function createAnnouncements(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'System',
      audience TEXT NOT NULL DEFAULT 'Everyone',
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      status announcement_status DEFAULT 'sent',
      published_by UUID,
      published_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_feed
    ON announcements (status, is_pinned DESC, published_at DESC);

    CREATE INDEX IF NOT EXISTS idx_announcements_audience
    ON announcements (audience, published_at DESC);
  `);
}
