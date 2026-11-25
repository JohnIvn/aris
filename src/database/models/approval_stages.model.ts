import { Pool } from 'pg';

export async function createApprovalStages(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS approval_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stage_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      stage_order INT NOT NULL CHECK (stage_order > 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    -- Add dynamic workflow columns
    ALTER TABLE approval_stages
      ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'AR',
      ADD COLUMN IF NOT EXISTS role_name TEXT,
      ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3a7d4e',
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    -- Drop the global unique constraint on stage_order if it exists so orders are scoped per document_type
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'approval_stages_stage_order_key'
          AND conrelid = 'approval_stages'::regclass
      ) THEN
        EXECUTE 'ALTER TABLE approval_stages DROP CONSTRAINT approval_stages_stage_order_key';
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_approval_stages_doc_order
    ON approval_stages (document_type, stage_order);

    -- Ensure accomplishment_reports and dtr_submissions have workflow_snapshot column
    DO $$
    BEGIN
      IF to_regclass('public.accomplishment_reports') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE accomplishment_reports ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB';
      END IF;

      IF to_regclass('public.dtr_submissions') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE dtr_submissions ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB, ADD COLUMN IF NOT EXISTS current_stage TEXT';
      END IF;
    END $$;

    -- Drop ON DELETE CASCADE from accomplishment_reports foreign key if it exists,
    -- to guarantee past applications are NEVER accidentally deleted if an admin modifies stages.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'accomplishment_reports_approval_stage_fkey'
          AND conrelid = 'accomplishment_reports'::regclass
      ) THEN
        EXECUTE 'ALTER TABLE accomplishment_reports DROP CONSTRAINT accomplishment_reports_approval_stage_fkey';
        EXECUTE 'ALTER TABLE accomplishment_reports ADD CONSTRAINT accomplishment_reports_approval_stage_fkey FOREIGN KEY (approval_stage) REFERENCES approval_stages(stage_key) ON UPDATE CASCADE ON DELETE RESTRICT';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$;

    -- Seed or update default canonical AR stages
    INSERT INTO approval_stages (stage_key, label, role_name, stage_order, document_type, color, description, is_final, is_active)
    VALUES
      ('AR-AP-STG-1', 'Checker', 'Checker', 1, 'AR', '#3a7d4e', 'Initial verification of attendance and accomplishment report entries', FALSE, TRUE),
      ('AR-AP-STG-2', 'Secretary', 'Secretary', 2, 'AR', '#3f8ecc', 'College/Department secretary review and endorsement', FALSE, TRUE),
      ('AR-AP-STG-3', 'HR', 'HR', 3, 'AR', '#8a63c4', 'Human Resources validation and employment policy compliance', FALSE, TRUE),
      ('AR-AP-STG-4', 'Accounting', 'Accounting', 4, 'AR', '#d99a2b', 'Final accounting audit and payroll release clearance', TRUE, TRUE)
    ON CONFLICT (stage_key) DO UPDATE
      SET label = EXCLUDED.label,
          role_name = COALESCE(approval_stages.role_name, EXCLUDED.role_name),
          document_type = 'AR',
          color = COALESCE(approval_stages.color, EXCLUDED.color),
          description = COALESCE(approval_stages.description, EXCLUDED.description),
          is_final = EXCLUDED.is_final;

    -- Seed or update default canonical DTR stages
    INSERT INTO approval_stages (stage_key, label, role_name, stage_order, document_type, color, description, is_final, is_active)
    VALUES
      ('DTR-AP-STG-1', 'Checker', 'Checker', 1, 'DTR', '#3a7d4e', 'Verification of raw attendance and duty hours', FALSE, TRUE),
      ('DTR-AP-STG-2', 'Secretary', 'Secretary', 2, 'DTR', '#3f8ecc', 'Department secretary endorsement of logged shifts', FALSE, TRUE),
      ('DTR-AP-STG-3', 'HR', 'HR', 3, 'DTR', '#8a63c4', 'HR verification of biometric logs and duty records', FALSE, TRUE),
      ('DTR-AP-STG-4', 'Accounting', 'Accounting', 4, 'DTR', '#d99a2b', 'Final DTR payroll verification and release', TRUE, TRUE)
    ON CONFLICT (stage_key) DO UPDATE
      SET label = EXCLUDED.label,
          role_name = COALESCE(approval_stages.role_name, EXCLUDED.role_name),
          stage_order = EXCLUDED.stage_order,
          document_type = 'DTR',
          color = COALESCE(approval_stages.color, EXCLUDED.color),
          description = COALESCE(approval_stages.description, EXCLUDED.description),
          is_final = EXCLUDED.is_final;
  `);
}
