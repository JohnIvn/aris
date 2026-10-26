import { Pool } from 'pg';

export async function createDirectMessages(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id UUID NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT,
      recipient_id UUID NOT NULL,
      recipient_role TEXT NOT NULL,
      recipient_name TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_direct_messages_participants
    ON direct_messages (sender_id, recipient_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient
    ON direct_messages (recipient_id, is_read, created_at DESC);

    DO $$ BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

