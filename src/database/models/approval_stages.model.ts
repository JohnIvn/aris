import { Pool } from 'pg';

export async function createApprovalStages(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS approval_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stage_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      stage_order INT NOT NULL UNIQUE CHECK (stage_order > 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_approval_stages_order
    ON approval_stages (stage_order);
  `);
}
