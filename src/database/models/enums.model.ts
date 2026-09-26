import { Pool } from 'pg';

export async function createEnumTypes(client: Pool) {
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('professor', 'staff', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE account_provider AS ENUM ('local', 'google');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(
    `DO $$ BEGIN
      CREATE TYPE report_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'pending');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;`,
  );

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE auth_action AS ENUM ('signin', 'signup', 'signout');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE admin_action AS ENUM (
      'create_user',
      'update_user',
      'delete_user'
      );    
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE user_action AS ENUM (
      'create_report',
      'update_report',
      'delete_report',
      'create_report_entry',
      'update_report_entry',
      'delete_report_entry',
      'create_payroll',
      'update_payroll',
      'delete_payroll'
      );    
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE action_status AS ENUM ('success', 'failure', 'invalid');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
  DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
      'ar_submitted',
      'ar_updated',
      'ar_status_changed',
      'ar_rejected',
      'ar_approved',
      'ar_returned',
      'ar_forwarded',
      'ar_department_secretary',
      'ar_hr',
      'ar_accounting',
      'payroll_updated',
      'payroll_status_changed',
      'payroll_ready',
      'payroll_rejected',
      'payroll_moved',
      'performance_notification',
      'performance_updated',
      'performance_reviewed',
      'performance_recorded'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
`);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'flagged', 'skipped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE log_kind AS ENUM ('auth', 'security', 'alert');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE announcement_status AS ENUM ('draft', 'scheduled', 'sent', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE support_channel_kind AS ENUM ('email', 'phone', 'chat', 'walk_in');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE backup_status AS ENUM ('verified', 'archived', 'failed', 'pending');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE backup_type AS ENUM ('automated_daily', 'manual_snapshot', 'weekly_full');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE payroll_action AS ENUM (
        'create_payroll',
        'update_payroll',
        'delete_payroll',
        'email_payroll',
        'sms_payroll'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE meeting_status AS ENUM ('scheduled', 'in_progress', 'summarized', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE meeting_action AS ENUM (
        'create_meeting',
        'update_meeting',
        'delete_meeting',
        'upload_transcript',
        'summarize_meeting'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
