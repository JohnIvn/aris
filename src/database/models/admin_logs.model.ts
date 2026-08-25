import { Pool } from 'pg';

export async function createAdminLogs(client: Pool) {
  await client.query(`
        CREATE TABLE IF NOT EXISTS admin_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            action_type admin_action,
            action_status action_status,
            admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        `);
}
