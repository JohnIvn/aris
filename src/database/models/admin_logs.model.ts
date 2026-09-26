import { Pool } from 'pg';

export async function createAdminLogs(client: Pool) {
  await client.query(`
        CREATE TABLE IF NOT EXISTS admin_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            action_type admin_action,
            auth_action auth_action,
            action_status action_status,
            admin_id UUID REFERENCES user_admins(id) ON DELETE SET NULL,
            user_id UUID,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id
        ON admin_logs (admin_id);

        CREATE INDEX IF NOT EXISTS idx_admin_logs_auth_action
        ON admin_logs (auth_action);
        `);
}
