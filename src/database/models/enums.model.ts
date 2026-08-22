import { Pool } from 'pg';

export async function createEnumTypes(client: Pool) {
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE member_role AS ENUM ('employee', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

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
}
