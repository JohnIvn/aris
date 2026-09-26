import { Pool } from 'pg';

export async function createAuthLogs(client: Pool) {
  await client.query(`
        CREATE TABLE IF NOT EXISTS auth_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            action_type auth_action,
            action_status action_status,
            user_id UUID REFERENCES user_admins(id) ON DELETE SET NULL,
            role user_role DEFAULT 'staff',
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        `);
}
