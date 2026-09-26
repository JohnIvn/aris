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
      'accept_ar',
      'reject_ar',
      'update_ar',
      'delete_ar',
      'create_user',
      'update_user',
      'delete_user', 
      'create_payroll',
      'update_payroll',
      'delete_payroll',
      'email_payroll',
      'sms_payroll'
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
}
