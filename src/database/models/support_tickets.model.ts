import { Pool } from 'pg';

export async function createSupportTickets(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_code TEXT NOT NULL UNIQUE,
      opened_by UUID NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      channel_id UUID REFERENCES support_channels(id) ON DELETE SET NULL,
      priority ticket_priority DEFAULT 'normal',
      status ticket_status DEFAULT 'open',
      assigned_to UUID,
      related_report_id UUID REFERENCES accomplishment_reports(id) ON DELETE SET NULL,
      opened_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status, opened_at DESC);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_opened_by
    ON support_tickets (opened_by);
  `);
}
