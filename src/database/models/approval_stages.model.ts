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

    DO $$
    BEGIN
      UPDATE approval_stages
         SET stage_key = 'AR-AP-STG-1',
             label = 'Checker'
       WHERE stage_key = 'Checker'
         AND NOT EXISTS (
           SELECT 1 FROM approval_stages WHERE stage_key = 'AR-AP-STG-1'
         );

      IF to_regclass('public.accomplishment_reports') IS NOT NULL THEN
        UPDATE accomplishment_reports
           SET approval_stage = 'AR-AP-STG-1'
         WHERE approval_stage = 'Checker';
      END IF;
    END $$;

    INSERT INTO approval_stages (stage_key, label, stage_order)
    VALUES
      ('AR-AP-STG-1', 'Checker', 1),
      ('AR-AP-STG-2', 'Secretary', 2),
      ('AR-AP-STG-3', 'HR', 3),
      ('AR-AP-STG-4', 'Accounting', 4),
      ('DTR-AP-STG-1', 'Checker', 5),
      ('DTR-AP-STG-2', 'Secretary', 6),
      ('DTR-AP-STG-3', 'HR', 7),
      ('DTR-AP-STG-4', 'Accounting', 8)
    ON CONFLICT (stage_key) DO UPDATE
      SET label = EXCLUDED.label,
          stage_order = EXCLUDED.stage_order,
          is_active = TRUE;
  `);
}
